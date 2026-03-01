import express from 'express';
import dns from 'node:dns';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// In-memory LRU cache with 1h TTL and hard cap of 200 entries
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const CACHE_MAX_SIZE = 200;

// Dedicated rate limiter for link preview
const linkPreviewLimiter = rateLimit({
  windowMs: 60000,
  max: 20,
  skip: process.env.NODE_ENV === 'test' ? () => true : undefined,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: 'Too many link preview requests, please try again later' },
});

// Check if an IP address is private/reserved
function isPrivateIP(ip) {
  // IPv4 private ranges
  if (/^127\./.test(ip)) return true;
  if (/^10\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  if (ip === '0.0.0.0') return true;
  // IPv6 private ranges
  if (ip === '::1') return true;
  if (/^fc00/i.test(ip) || /^fd/i.test(ip)) return true; // fc00::/7
  return false;
}

// SSRF protection: block private/reserved IP ranges (with DNS resolution)
async function isPrivateUrl(urlString) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname;
    // Block common private hostnames
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local')
    ) {
      return true;
    }
    // Quick regex check for IP-format hostnames
    if (
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname)
    ) {
      return true;
    }
    // DNS resolution step: resolve hostname and check resolved IP
    try {
      const { address } = await dns.promises.lookup(hostname);
      if (isPrivateIP(address)) {
        return true;
      }
    } catch {
      // DNS resolution failed - block the request
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function extractOgTag(html, property) {
  // Match both property="og:..." and name="og:..."
  const regex = new RegExp(
    `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']` +
    `|<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
    'i'
  );
  const match = html.match(regex);
  return match ? (match[1] || match[2] || '') : '';
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() : '';
}

function extractFavicon(html, baseUrl) {
  const match = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']*)["']/i)
    || html.match(/<link[^>]*href=["']([^"']*)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
  if (match) {
    try {
      return new URL(match[1], baseUrl).href;
    } catch {
      return null;
    }
  }
  // Default favicon
  try {
    return new URL('/favicon.ico', baseUrl).href;
  } catch {
    return null;
  }
}

router.get('/', authenticate, linkPreviewLimiter, async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' });
  }

  // SSRF protection
  if (await isPrivateUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Check cache
  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    // Follow redirects manually to validate each redirect target
    let currentUrl = url;
    let response;
    const MAX_REDIRECTS = 3;

    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      response = await fetch(currentUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'BandChat LinkPreview/1.0',
          'Accept': 'text/html',
        },
        redirect: 'manual',
      });

      // Check if it's a redirect (3xx status)
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          clearTimeout(timeout);
          return res.status(502).json({ error: 'Redirect without Location header' });
        }

        // Resolve relative redirect URLs
        const redirectUrl = new URL(location, currentUrl).href;

        // Validate redirect target against SSRF
        if (await isPrivateUrl(redirectUrl)) {
          clearTimeout(timeout);
          return res.status(400).json({ error: 'Invalid redirect URL' });
        }

        if (i === MAX_REDIRECTS) {
          clearTimeout(timeout);
          return res.status(502).json({ error: 'Too many redirects' });
        }

        currentUrl = redirectUrl;
        continue;
      }

      // Not a redirect, break out of loop
      break;
    }

    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(502).json({ error: 'Failed to fetch URL' });
    }

    // Content-Length early check: reject responses > 500KB
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 500 * 1024) {
      return res.status(400).json({ error: 'Response too large' });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return res.status(400).json({ error: 'Not an HTML page' });
    }

    // Read only the first 50KB to avoid large payloads
    const reader = response.body.getReader();
    const chunks = [];
    let totalSize = 0;
    const maxSize = 50 * 1024;

    while (totalSize < maxSize) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalSize += value.length;
    }
    reader.cancel();

    const html = Buffer.concat(chunks).toString('utf-8');

    const ogTitle = extractOgTag(html, 'og:title');
    const ogDescription = extractOgTag(html, 'og:description');
    const ogImage = extractOgTag(html, 'og:image');
    const favicon = extractFavicon(html, currentUrl);
    const title = ogTitle || extractTitle(html);

    const data = {
      title: title || null,
      description: ogDescription || null,
      image: ogImage || null,
      favicon: favicon || null,
      url,
    };

    // LRU cache: enforce hard cap of 200 entries
    if (cache.size >= CACHE_MAX_SIZE) {
      // Delete the oldest entry (first key in the Map)
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }

    // Cache the result
    cache.set(url, { data, timestamp: Date.now() });

    res.json(data);
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timeout' });
    }
    console.error('Link preview error:', err.message);
    res.status(500).json({ error: 'Failed to fetch preview' });
  }
});

export default router;
