// Badge service - updates browser tab title, favicon, and PWA app badge

const ORIGINAL_TITLE = 'BandChat';
let originalFaviconHref = null;
let faviconCanvas = null;
let faviconImg = null;
let faviconLoaded = false;
let lastCount = 0;

function getFaviconLink() {
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  return link;
}

function ensureFaviconLoaded() {
  if (faviconLoaded) return Promise.resolve();

  return new Promise((resolve) => {
    const link = getFaviconLink();
    originalFaviconHref = link.href || '/favicon.svg';

    faviconImg = new Image();
    faviconImg.crossOrigin = 'anonymous';
    faviconImg.onload = () => {
      faviconLoaded = true;
      resolve();
    };
    faviconImg.onerror = () => {
      // If loading fails, skip favicon badge
      resolve();
    };
    faviconImg.src = originalFaviconHref;

    faviconCanvas = document.createElement('canvas');
    faviconCanvas.width = 64;
    faviconCanvas.height = 64;
  });
}

function drawFaviconBadge(count) {
  if (!faviconLoaded || !faviconCanvas || !faviconImg) return;

  const ctx = faviconCanvas.getContext('2d');
  const size = faviconCanvas.width;

  // Draw the original favicon
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(faviconImg, 0, 0, size, size);

  if (count > 0) {
    const label = count > 9 ? '9+' : String(count);
    const badgeRadius = label.length > 1 ? 15 : 12;
    const cx = size - badgeRadius;
    const cy = badgeRadius;

    // Red circle
    ctx.beginPath();
    ctx.arc(cx, cy, badgeRadius, 0, 2 * Math.PI);
    ctx.fillStyle = '#e53e3e';
    ctx.fill();

    // White border
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // White text
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${label.length > 1 ? 13 : 15}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 1);
  }

  const link = getFaviconLink();
  link.href = faviconCanvas.toDataURL('image/png');
}

function resetFavicon() {
  if (originalFaviconHref) {
    const link = getFaviconLink();
    link.href = originalFaviconHref;
  }
}

function updateAppBadge(count) {
  if ('setAppBadge' in navigator) {
    if (count > 0) {
      navigator.setAppBadge(count).catch(() => {});
    } else {
      navigator.clearAppBadge().catch(() => {});
    }
  }

  // Also tell the service worker so it can set badges when tab is inactive
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SET_BADGE',
      count
    });
  }
}

export async function updateBadge(count) {
  // Skip if count hasn't changed
  if (count === lastCount) return;
  lastCount = count;

  // 1. Update document title
  document.title = count > 0 ? `(${count}) ${ORIGINAL_TITLE}` : ORIGINAL_TITLE;

  // 2. Update favicon
  await ensureFaviconLoaded();
  if (count > 0) {
    drawFaviconBadge(count);
  } else {
    resetFavicon();
  }

  // 3. Update app badge (PWA)
  updateAppBadge(count);
}

export function clearBadge() {
  lastCount = 0;
  document.title = ORIGINAL_TITLE;
  resetFavicon();
  updateAppBadge(0);
}
