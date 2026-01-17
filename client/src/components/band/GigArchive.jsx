import { useState, useEffect } from 'react';
import api from '../../services/api';

function GigArchive({ workspaceId }) {
  const [gigs, setGigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedGig, setSelectedGig] = useState(null);
  const [showAddMedia, setShowAddMedia] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState('image');
  const [mediaCaption, setMediaCaption] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadGigs();
  }, [workspaceId]);

  const loadGigs = async () => {
    try {
      setLoading(true);
      const data = await api.getGigs(workspaceId);
      // Filter to completed gigs only
      const completedGigs = data.filter(g => g.status === 'COMPLETED');
      setGigs(completedGigs);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedGig) return;

    if (file.size > 50 * 1024 * 1024) {
      setError('File size must be less than 50MB');
      return;
    }

    setUploading(true);
    try {
      const result = await api.uploadFile(file);
      await api.addGigMedia(selectedGig.id, {
        type: file.type.startsWith('video') ? 'video' : 'image',
        url: result.url,
        caption: mediaCaption || file.name
      });
      await loadGigs();
      setShowAddMedia(false);
      setMediaCaption('');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleAddUrl = async (e) => {
    e.preventDefault();
    if (!mediaUrl || !selectedGig) return;

    setUploading(true);
    try {
      // Detect media type from URL
      let type = mediaType;
      if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) {
        type = 'youtube';
      }

      await api.addGigMedia(selectedGig.id, {
        type,
        url: mediaUrl,
        caption: mediaCaption
      });
      await loadGigs();
      setShowAddMedia(false);
      setMediaUrl('');
      setMediaCaption('');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteMedia = async (gigId, mediaId) => {
    if (!confirm('Delete this media?')) return;
    try {
      await api.deleteGigMedia(gigId, mediaId);
      await loadGigs();
    } catch (err) {
      setError(err.message);
    }
  };

  const getYouTubeEmbedUrl = (url) => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading archive...</div>;
  }

  return (
    <div className="h-full flex flex-col bg-gray-800">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">Gig Archive</h2>
        <p className="text-gray-400 text-sm mt-1">Photos, videos, and memories from your gigs</p>
      </div>

      {error && (
        <div className="mx-4 mt-4 bg-red-900/50 border border-red-500 text-red-200 px-4 py-2 rounded">
          {error}
          <button onClick={() => setError(null)} className="float-right">&times;</button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {gigs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-6xl mb-4">📸</div>
            <p className="text-lg mb-2">No completed gigs yet</p>
            <p className="text-sm">Complete a gig to start building your archive!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {gigs.map((gig) => (
              <div key={gig.id} className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
                {/* Gig Header */}
                <div className="p-4 border-b border-gray-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-white">{gig.title}</h3>
                      <div className="text-gray-400 text-sm">
                        {new Date(gig.date).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                        {gig.venue && ` • ${gig.venue}`}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedGig(gig);
                        setShowAddMedia(true);
                      }}
                      className="btn btn-primary text-sm"
                    >
                      + Add Media
                    </button>
                  </div>
                </div>

                {/* Media Grid */}
                <div className="p-4">
                  {gig.media?.length > 0 ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {gig.media.map((item) => (
                        <div key={item.id} className="relative group">
                          {item.type === 'image' ? (
                            <a href={item.url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={item.url}
                                alt={item.caption || 'Gig photo'}
                                className="w-full h-32 object-cover rounded-lg"
                              />
                            </a>
                          ) : item.type === 'youtube' ? (
                            <div className="relative">
                              <iframe
                                src={getYouTubeEmbedUrl(item.url)}
                                className="w-full h-32 rounded-lg"
                                allowFullScreen
                              />
                            </div>
                          ) : item.type === 'video' ? (
                            <video
                              src={item.url}
                              className="w-full h-32 object-cover rounded-lg"
                              controls
                            />
                          ) : (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center w-full h-32 bg-gray-800 rounded-lg hover:bg-gray-700"
                            >
                              <span className="text-4xl">🔗</span>
                            </a>
                          )}
                          {item.caption && (
                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 rounded-b-lg truncate">
                              {item.caption}
                            </div>
                          )}
                          <button
                            onClick={() => handleDeleteMedia(gig.id, item.id)}
                            className="absolute top-1 right-1 w-6 h-6 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>No media yet</p>
                      <button
                        onClick={() => {
                          setSelectedGig(gig);
                          setShowAddMedia(true);
                        }}
                        className="text-blue-400 hover:underline text-sm mt-1"
                      >
                        Add photos, videos, or links
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Media Modal */}
      {showAddMedia && selectedGig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg w-full max-w-md border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-medium text-white">Add Media to {selectedGig.title}</h3>
              <button
                onClick={() => {
                  setShowAddMedia(false);
                  setMediaUrl('');
                  setMediaCaption('');
                }}
                className="text-gray-400 hover:text-white text-2xl"
              >
                &times;
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Upload File */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Upload Image or Video
                </label>
                <label className="block">
                  <span className="btn btn-secondary w-full cursor-pointer text-center">
                    {uploading ? 'Uploading...' : 'Choose File'}
                  </span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
                <p className="text-gray-500 text-xs mt-1">Max 50MB. Images and videos supported.</p>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-700"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-gray-800 px-2 text-gray-500 text-sm">or add a link</span>
                </div>
              </div>

              {/* Add URL */}
              <form onSubmit={handleAddUrl}>
                <div className="mb-3">
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    URL (YouTube, image link, etc.)
                  </label>
                  <input
                    type="url"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
                  />
                </div>
                <div className="mb-3">
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    Caption (optional)
                  </label>
                  <input
                    type="text"
                    value={mediaCaption}
                    onChange={(e) => setMediaCaption(e.target.value)}
                    placeholder="Add a caption..."
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!mediaUrl || uploading}
                  className="btn btn-primary w-full"
                >
                  {uploading ? 'Adding...' : 'Add Link'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GigArchive;
