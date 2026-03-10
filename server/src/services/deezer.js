// Deezer API service for BPM data
// Free API, no authentication required
// https://developers.deezer.com/api

class DeezerService {
  constructor() {
    this.baseUrl = 'https://api.deezer.com';
  }

  isConfigured() {
    return true; // No API key needed
  }

  async searchTrack(title, artist) {
    try {
      const query = artist ? `${artist} ${title}` : title;
      const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&limit=5`;

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('Deezer search failed:', response.status);
        return null;
      }

      const data = await response.json();

      if (!data.data || data.data.length === 0) {
        return null;
      }

      // Return the first track ID
      const track = data.data[0];
      return track.id;
    } catch (error) {
      console.error('Deezer search error:', error.message);
      return null;
    }
  }

  async getTrackDetails(trackId) {
    try {
      const url = `${this.baseUrl}/track/${trackId}`;

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('Deezer track fetch failed:', response.status);
        return null;
      }

      const track = await response.json();

      // Deezer provides BPM but not key
      const bpm = track.bpm && track.bpm > 0 ? Math.round(track.bpm) : null;

      if (!bpm) {
        return null;
      }

      return { bpm, key: null };
    } catch (error) {
      console.error('Deezer track error:', error.message);
      return null;
    }
  }

  async getTrackMetadata(title, artist) {
    try {
      // Step 1: Search for the track
      const trackId = await this.searchTrack(title, artist);
      if (!trackId) {
        return null;
      }

      // Step 2: Get track details with BPM
      const details = await this.getTrackDetails(trackId);
      return details;
    } catch (error) {
      console.error('Deezer service error:', error.message);
      return null;
    }
  }
}

export const deezerService = new DeezerService();
export default deezerService;
