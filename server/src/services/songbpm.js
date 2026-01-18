// GetSongBPM API service for fetching song metadata
// https://getsongbpm.com/api

class SongBPMService {
  constructor() {
    // Try the main domain with /api path
    this.baseUrl = 'https://getsongbpm.com/api';
    // Log on startup whether API key is configured
    console.log('SongBPM Service initialized - API key configured:', !!process.env.GETSONGBPM_API_KEY);
  }

  getApiKey() {
    return process.env.GETSONGBPM_API_KEY;
  }

  isConfigured() {
    return !!this.getApiKey();
  }

  async searchTrack(title, artist) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('GetSongBPM API key not configured');
    }

    try {
      // Build search query using the documented format
      // For "both" type: lookup=song:TITLE artist:ARTIST
      let lookup;
      let type;

      if (artist) {
        type = 'both';
        lookup = `song:${title} artist:${artist}`;
      } else {
        type = 'song';
        lookup = title;
      }

      const params = new URLSearchParams({
        type: type,
        lookup: lookup
      });

      const url = `${this.baseUrl}/search/?${params}`;
      console.log('GetSongBPM search URL:', url);

      const response = await fetch(url, {
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json',
        }
      });

      const responseText = await response.text();

      if (!response.ok) {
        console.error('GetSongBPM search failed:', response.status, responseText.slice(0, 500));
        return null;
      }

      // Check if response is HTML (Cloudflare block) vs JSON
      if (responseText.trim().startsWith('<')) {
        console.error('GetSongBPM returned HTML instead of JSON - likely blocked');
        return null;
      }

      const data = JSON.parse(responseText);
      console.log('GetSongBPM response:', JSON.stringify(data).slice(0, 300));

      // Check if we got results
      if (!data.search || data.search.length === 0) {
        console.log('GetSongBPM: No results for', query);
        return null;
      }

      // Get the first result
      const result = data.search[0];

      return {
        songId: result.id,
        title: result.title,
        artist: result.artist?.name || artist,
        bpm: result.tempo ? parseInt(result.tempo) : null,
        keyOf: result.key_of || null,
        album: result.album?.title || null
      };
    } catch (error) {
      console.error('GetSongBPM search error:', error);
      return null;
    }
  }

  async getTrackDetails(songId) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('GetSongBPM API key not configured');
    }

    try {
      const params = new URLSearchParams({
        id: songId
      });

      const response = await fetch(`${this.baseUrl}/song/?${params}`, {
        headers: {
          'X-API-KEY': apiKey,
          'Accept': 'application/json',
        }
      });

      if (!response.ok) {
        console.error('GetSongBPM details failed:', response.status);
        return null;
      }

      const data = await response.json();

      if (!data.song) {
        return null;
      }

      const song = data.song;

      // Parse key - GetSongBPM returns key like "C Major" or "A Minor"
      let key = null;
      if (song.key_of) {
        // Convert "C Major" to "C" and "A Minor" to "Am"
        const keyParts = song.key_of.split(' ');
        if (keyParts.length >= 1) {
          key = keyParts[0];
          if (keyParts[1]?.toLowerCase() === 'minor') {
            key += 'm';
          }
        }
      }

      return {
        bpm: song.tempo ? parseInt(song.tempo) : null,
        key: key,
        artist: song.artist?.name || null,
        album: song.album?.title || null,
        // GetSongBPM doesn't provide duration, so we'll leave that null
        duration: null
      };
    } catch (error) {
      console.error('GetSongBPM details error:', error);
      return null;
    }
  }

  async getTrackMetadata(title, artist) {
    try {
      // First search for the track
      const searchResult = await this.searchTrack(title, artist);

      if (!searchResult) {
        return null;
      }

      // Always fetch full details to get BPM and key
      const details = await this.getTrackDetails(searchResult.songId);

      console.log('GetSongBPM details for', title, ':', details);

      // Combine search and details results
      const bpm = details?.bpm || searchResult.bpm || null;
      let key = details?.key || null;

      // If no key from details but we have keyOf from search, parse it
      if (!key && searchResult.keyOf) {
        const keyParts = searchResult.keyOf.split(' ');
        if (keyParts.length >= 1) {
          key = keyParts[0];
          if (keyParts[1]?.toLowerCase() === 'minor') {
            key += 'm';
          }
        }
      }

      return {
        bpm: bpm,
        key: key,
        artist: details?.artist || searchResult.artist,
        duration: null // GetSongBPM doesn't provide duration
      };
    } catch (error) {
      console.error('Error fetching GetSongBPM metadata:', error);
      return null;
    }
  }
}

export const songBPMService = new SongBPMService();
export default songBPMService;
