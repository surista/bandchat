// AcousticBrainz service for BPM and Key data
// Uses MusicBrainz to find recording ID, then AcousticBrainz for audio features
// Note: AcousticBrainz stopped collecting new data in 2022, so newer songs won't have data

class AcousticBrainzService {
  constructor() {
    this.musicBrainzUrl = 'https://musicbrainz.org/ws/2';
    this.acousticBrainzUrl = 'https://acousticbrainz.org/api/v1';
    // MusicBrainz requires a user agent with contact info
    this.userAgent = 'BandChat/1.0 (https://bandchat.app)';
  }

  isConfigured() {
    return true; // No API key needed
  }

  // Search MusicBrainz for a recording and get its MBID
  async searchMusicBrainz(title, artist) {
    try {
      // Build query - MusicBrainz uses Lucene query syntax
      let query = `recording:"${title}"`;
      if (artist) {
        query += ` AND artist:"${artist}"`;
      }

      const params = new URLSearchParams({
        query: query,
        fmt: 'json',
        limit: '5'
      });

      const url = `${this.musicBrainzUrl}/recording/?${params}`;
      console.log('MusicBrainz search:', title, artist);

      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('MusicBrainz search failed:', response.status);
        return null;
      }

      const data = await response.json();

      if (!data.recordings || data.recordings.length === 0) {
        console.log('MusicBrainz: No results for', title);
        return null;
      }

      // Return the first recording's MBID
      const recording = data.recordings[0];
      console.log('MusicBrainz found:', recording.title, 'by', recording['artist-credit']?.[0]?.name);
      return recording.id;
    } catch (error) {
      console.error('MusicBrainz search error:', error.message);
      return null;
    }
  }

  // Get audio features from AcousticBrainz using MBID
  async getAcousticBrainzData(mbid) {
    try {
      // Try high-level data first (has key, bpm)
      const url = `${this.acousticBrainzUrl}/${mbid}/high-level`;
      console.log('AcousticBrainz lookup:', mbid);

      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        // Try low-level as fallback
        if (response.status === 404) {
          console.log('AcousticBrainz: No high-level data, trying low-level');
          return await this.getLowLevelData(mbid);
        }
        console.error('AcousticBrainz failed:', response.status);
        return null;
      }

      const data = await response.json();
      return this.parseHighLevelData(data);
    } catch (error) {
      console.error('AcousticBrainz error:', error.message);
      return null;
    }
  }

  async getLowLevelData(mbid) {
    try {
      const url = `${this.acousticBrainzUrl}/${mbid}/low-level`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        console.log('AcousticBrainz: No data for', mbid);
        return null;
      }

      const data = await response.json();
      return this.parseLowLevelData(data);
    } catch (error) {
      console.error('AcousticBrainz low-level error:', error.message);
      return null;
    }
  }

  parseHighLevelData(data) {
    let bpm = null;
    let key = null;

    // BPM from rhythm
    if (data.rhythm?.bpm) {
      bpm = Math.round(data.rhythm.bpm);
    }

    // Key from tonal
    if (data.tonal?.key_key && data.tonal?.key_scale) {
      const keyNote = data.tonal.key_key;
      const scale = data.tonal.key_scale;
      key = scale === 'minor' ? `${keyNote}m` : keyNote;
    }

    if (!bpm && !key) {
      return null;
    }

    console.log('AcousticBrainz high-level:', { bpm, key });
    return { bpm, key };
  }

  parseLowLevelData(data) {
    let bpm = null;
    let key = null;

    // BPM from rhythm.bpm
    if (data.rhythm?.bpm) {
      bpm = Math.round(data.rhythm.bpm);
    }

    // Key from tonal.key_key and tonal.key_scale
    if (data.tonal?.key_key && data.tonal?.key_scale) {
      const keyNote = data.tonal.key_key;
      const scale = data.tonal.key_scale;
      key = scale === 'minor' ? `${keyNote}m` : keyNote;
    }

    // Alternative: chords_key
    if (!key && data.tonal?.chords_key) {
      key = data.tonal.chords_key;
      if (data.tonal?.chords_scale === 'minor') {
        key += 'm';
      }
    }

    if (!bpm && !key) {
      return null;
    }

    console.log('AcousticBrainz low-level:', { bpm, key });
    return { bpm, key };
  }

  // Main method: search and get metadata
  async getTrackMetadata(title, artist) {
    try {
      // Step 1: Find the recording in MusicBrainz
      const mbid = await this.searchMusicBrainz(title, artist);
      if (!mbid) {
        return null;
      }

      // MusicBrainz rate limit: 1 request per second
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Step 2: Get audio features from AcousticBrainz
      const features = await this.getAcousticBrainzData(mbid);
      return features;
    } catch (error) {
      console.error('AcousticBrainz service error:', error.message);
      return null;
    }
  }
}

export const acousticBrainzService = new AcousticBrainzService();
export default acousticBrainzService;
