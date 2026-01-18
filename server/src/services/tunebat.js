// Tunebat scraping service for BPM and Key data

class TunebatService {
  constructor() {
    this.baseUrl = 'https://tunebat.com';
  }

  isConfigured() {
    return true; // No API key needed
  }

  async searchTrack(title, artist) {
    try {
      const query = artist ? `${artist} ${title}` : title;
      const searchUrl = `${this.baseUrl}/Search?q=${encodeURIComponent(query)}`;

      console.log('Tunebat search:', query);

      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });

      if (!response.ok) {
        console.error('Tunebat search failed:', response.status);
        return null;
      }

      const html = await response.text();

      // Parse BPM and Key from the HTML
      // Tunebat shows results with BPM and Key in the search results
      const bpmMatch = html.match(/(\d{2,3})\s*BPM/i);
      const keyMatch = html.match(/class="[^"]*key[^"]*"[^>]*>([A-G][#b]?\s*(?:Major|Minor|maj|min)?)/i) ||
                       html.match(/>([A-G][#b]?(?:m)?)\s*<\/(?:span|div)/i);

      let bpm = null;
      let key = null;

      if (bpmMatch) {
        bpm = parseInt(bpmMatch[1]);
        console.log('Tunebat found BPM:', bpm);
      }

      if (keyMatch) {
        key = keyMatch[1].trim();
        // Normalize key format
        key = key.replace(/\s*Major/i, '').replace(/\s*Minor/i, 'm').replace(/\s*maj/i, '').replace(/\s*min/i, 'm');
        console.log('Tunebat found Key:', key);
      }

      if (!bpm && !key) {
        console.log('Tunebat: No BPM/Key found for', query);
        return null;
      }

      return { bpm, key };
    } catch (error) {
      console.error('Tunebat search error:', error.message);
      return null;
    }
  }

  async getTrackMetadata(title, artist) {
    return this.searchTrack(title, artist);
  }
}

export const tunebatService = new TunebatService();
export default tunebatService;
