// Spotify API service for fetching song metadata

class SpotifyService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Spotify credentials not configured');
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
      },
      body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
      throw new Error('Failed to get Spotify access token');
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    // Set expiry 60 seconds before actual expiry to be safe
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

    return this.accessToken;
  }

  async searchTrack(title, artist) {
    const token = await this.getAccessToken();

    // Build search query
    let query = title;
    if (artist) {
      query += ` artist:${artist}`;
    }

    const params = new URLSearchParams({
      q: query,
      type: 'track',
      limit: 1
    });

    const response = await fetch(`https://api.spotify.com/v1/search?${params}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.error('Spotify search failed:', response.status);
      return null;
    }

    const data = await response.json();
    const track = data.tracks?.items?.[0];

    if (!track) {
      return null;
    }

    return {
      spotifyId: track.id,
      spotifyUrl: track.external_urls?.spotify,
      duration: Math.round(track.duration_ms / 1000), // Convert to seconds
      artist: track.artists?.[0]?.name || artist
    };
  }

  async getAudioFeatures(trackId) {
    const token = await this.getAccessToken();

    const response = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.error('Spotify audio features failed:', response.status);
      return null;
    }

    const data = await response.json();

    // Convert Spotify's pitch class to key name
    const pitchClasses = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const key = data.key >= 0 ? pitchClasses[data.key] : null;
    const mode = data.mode === 1 ? '' : 'm'; // 1 = major, 0 = minor

    return {
      bpm: data.tempo ? Math.round(data.tempo) : null,
      key: key ? `${key}${mode}` : null
    };
  }

  async getTrackMetadata(title, artist) {
    try {
      // First search for the track
      const trackInfo = await this.searchTrack(title, artist);

      if (!trackInfo) {
        return null;
      }

      // Then get audio features (BPM, key)
      const audioFeatures = await this.getAudioFeatures(trackInfo.spotifyId);

      return {
        spotifyUrl: trackInfo.spotifyUrl,
        duration: trackInfo.duration,
        artist: trackInfo.artist,
        bpm: audioFeatures?.bpm || null,
        key: audioFeatures?.key || null
      };
    } catch (error) {
      console.error('Error fetching Spotify metadata:', error);
      return null;
    }
  }

  isConfigured() {
    return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
  }
}

export const spotifyService = new SpotifyService();
export default spotifyService;
