// Spotify service - generates search URLs (API access restricted)
// If Spotify API becomes available, this can be expanded

class SpotifyService {
  generateSearchUrl(title, artist) {
    const query = artist ? `${artist} ${title}` : title;
    return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
  }
}

export const spotifyService = new SpotifyService();
export default spotifyService;
