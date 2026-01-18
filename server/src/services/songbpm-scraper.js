// SongBPM.com scraper service for BPM and Key data
// Scrapes the website directly - no API needed

class SongBPMScraperService {
  constructor() {
    this.baseUrl = 'https://songbpm.com';
  }

  isConfigured() {
    return true;
  }

  // Convert artist/title to URL slug
  slugify(text) {
    return text
      .toLowerCase()
      .replace(/['']/g, '')           // Remove apostrophes
      .replace(/&/g, 'and')           // Replace & with 'and'
      .replace(/[^a-z0-9]+/g, '-')    // Replace non-alphanumeric with dashes
      .replace(/^-+|-+$/g, '')        // Remove leading/trailing dashes
      .replace(/-+/g, '-');           // Collapse multiple dashes
  }

  async getTrackMetadata(title, artist) {
    if (!artist) {
      console.log('SongBPM scraper: No artist provided, skipping');
      return null;
    }

    try {
      const artistSlug = this.slugify(artist);
      const titleSlug = this.slugify(title);
      const url = `${this.baseUrl}/@${artistSlug}/${titleSlug}`;

      console.log('SongBPM scraper URL:', url);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });

      if (!response.ok) {
        console.log('SongBPM scraper: Page not found for', title, 'by', artist);
        return null;
      }

      const html = await response.text();

      // Parse BPM - look for patterns like "75 BPM" or "161 BPM"
      let bpm = null;
      const bpmMatch = html.match(/(\d{2,3})\s*BPM/i);
      if (bpmMatch) {
        bpm = parseInt(bpmMatch[1]);
        console.log('SongBPM scraper found BPM:', bpm);
      }

      // Parse Key - look for patterns like "Key: B" or "Key: G major"
      // Also look for key in various formats
      let key = null;

      // Try to find key in structured data or text
      const keyPatterns = [
        /Key[:\s]+([A-G][#♯b♭]?)\s*(major|minor|maj|min)?/i,
        /"key"[:\s]+"?([A-G][#♯b♭]?)"?\s*(major|minor)?/i,
        />([A-G][#♯b♭]?)\s*(major|minor)?<\/(?:span|div|td)/i,
      ];

      for (const pattern of keyPatterns) {
        const keyMatch = html.match(pattern);
        if (keyMatch) {
          key = keyMatch[1];
          // Normalize sharps and flats
          key = key.replace('♯', '#').replace('♭', 'b');
          // Add 'm' for minor keys
          if (keyMatch[2] && keyMatch[2].toLowerCase().startsWith('min')) {
            key += 'm';
          }
          console.log('SongBPM scraper found Key:', key);
          break;
        }
      }

      if (!bpm && !key) {
        console.log('SongBPM scraper: No data found for', title);
        return null;
      }

      return { bpm, key };
    } catch (error) {
      console.error('SongBPM scraper error:', error.message);
      return null;
    }
  }
}

export const songBPMScraperService = new SongBPMScraperService();
export default songBPMScraperService;
