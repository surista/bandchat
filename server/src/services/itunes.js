// iTunes Search API service for fetching song duration
// https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/

class iTunesService {
  constructor() {
    this.baseUrl = 'https://itunes.apple.com';
  }

  async searchTrack(title, artist) {
    try {
      // Build search query
      let query = title;
      if (artist) {
        query = `${artist} ${title}`;
      }

      const params = new URLSearchParams({
        term: query,
        media: 'music',
        entity: 'song',
        limit: 5
      });

      const response = await fetch(`${this.baseUrl}/search?${params}`, {
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        console.error('iTunes search failed:', response.status);
        return null;
      }

      const data = await response.json();

      if (!data.results || data.results.length === 0) {
        return null;
      }

      // Find best match - prefer exact title match
      const normalizedTitle = title.toLowerCase().trim();
      const normalizedArtist = artist?.toLowerCase().trim();

      let bestMatch = data.results[0];

      for (const result of data.results) {
        const resultTitle = result.trackName?.toLowerCase().trim();
        const resultArtist = result.artistName?.toLowerCase().trim();

        // Exact title match
        if (resultTitle === normalizedTitle) {
          // If artist also matches, this is definitely the best
          if (normalizedArtist && resultArtist?.includes(normalizedArtist)) {
            bestMatch = result;
            break;
          }
          bestMatch = result;
        }
      }

      return {
        title: bestMatch.trackName,
        artist: bestMatch.artistName,
        album: bestMatch.collectionName,
        // iTunes returns duration in milliseconds, convert to seconds
        duration: bestMatch.trackTimeMillis ? Math.round(bestMatch.trackTimeMillis / 1000) : null,
        previewUrl: bestMatch.previewUrl,
        artworkUrl: bestMatch.artworkUrl100
      };
    } catch (error) {
      console.error('iTunes search error:', error);
      return null;
    }
  }

  async getDuration(title, artist) {
    const result = await this.searchTrack(title, artist);
    return result?.duration || null;
  }
}

export const itunesService = new iTunesService();
export default itunesService;
