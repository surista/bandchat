// YouTube Data API service for fetching video links
// https://developers.google.com/youtube/v3

class YouTubeService {
  constructor() {
    this.baseUrl = 'https://www.googleapis.com/youtube/v3';
  }

  getApiKey() {
    return process.env.YOUTUBE_API_KEY;
  }

  isConfigured() {
    return !!this.getApiKey();
  }

  async searchVideo(title, artist) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      // Return search URL as fallback
      const query = artist ? `${artist} ${title}` : title;
      return {
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        isSearchUrl: true
      };
    }

    try {
      const query = artist ? `${artist} ${title} official` : `${title} official`;

      const params = new URLSearchParams({
        key: apiKey,
        part: 'snippet',
        q: query,
        type: 'video',
        maxResults: 5,
        videoCategoryId: '10' // Music category
      });

      const response = await fetch(`${this.baseUrl}/search?${params}`, {
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('YouTube search failed:', response.status, error);
        // Return search URL as fallback
        return {
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
          isSearchUrl: true
        };
      }

      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        return null;
      }

      // Get the first result (usually most relevant)
      const video = data.items[0];
      const videoId = video.id.videoId;

      return {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        videoId: videoId,
        title: video.snippet.title,
        channelTitle: video.snippet.channelTitle,
        thumbnail: video.snippet.thumbnails?.default?.url,
        isSearchUrl: false
      };
    } catch (error) {
      console.error('YouTube search error:', error);
      // Return search URL as fallback
      const query = artist ? `${artist} ${title}` : title;
      return {
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        isSearchUrl: true
      };
    }
  }
}

export const youtubeService = new YouTubeService();
export default youtubeService;
