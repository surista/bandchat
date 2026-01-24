import { useState, useEffect, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import api from '../../../services/api';

const INSTRUMENTS = [
  'Vocals',
  'Lead Guitar',
  'Rhythm Guitar',
  'Guitar',
  'Bass',
  'Drums',
  'Keyboard',
  'Piano',
  'Saxophone',
  'Trumpet',
  'Harmonica',
  'Violin',
  'Percussion',
  'DJ',
  'Other'
];

// Utility to create cropped image
const createCroppedImage = async (imageSrc, pixelCrop) => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Set canvas size to the cropped area
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // Draw the cropped image
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  // Return as blob
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/jpeg', 0.9);
  });
};

const createImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.crossOrigin = 'anonymous';
    image.src = url;
  });

function BandMemberForm({ member, onSave, onCancel, loading, workspaceMembers = [] }) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [guestInstruments, setGuestInstruments] = useState([]);
  const [stints, setStints] = useState([{ instruments: [], startDate: '', endDate: '' }]);
  const [linkedUserId, setLinkedUserId] = useState('');

  // Cropper state
  const [showCropper, setShowCropper] = useState(false);
  const [imageToCrop, setImageToCrop] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  useEffect(() => {
    if (member) {
      setName(member.name || '');
      setNotes(member.notes || '');
      setImageUrl(member.imageUrl || '');
      setIsGuest(member.isGuest || false);
      setLinkedUserId(member.linkedUserId || member.linkedUser?.id || '');
      if (member.stints && member.stints.length > 0) {
        // For guests, extract instruments from first stint
        const allInstruments = member.stints.flatMap(s =>
          s.instruments || (s.instrument ? [s.instrument] : [])
        );
        setGuestInstruments([...new Set(allInstruments)]);
        setStints(member.stints.map(s => ({
          id: s.id,
          // Handle both old (instrument) and new (instruments) format
          instruments: s.instruments || (s.instrument ? [s.instrument] : []),
          startDate: s.startDate ? new Date(s.startDate).toISOString().split('T')[0] : '',
          endDate: s.endDate ? new Date(s.endDate).toISOString().split('T')[0] : ''
        })));
      } else {
        setGuestInstruments([]);
        setStints([{ instruments: [], startDate: '', endDate: '' }]);
      }
    } else {
      setName('');
      setNotes('');
      setImageUrl('');
      setIsGuest(false);
      setGuestInstruments([]);
      setLinkedUserId('');
      setStints([{ instruments: [], startDate: '', endDate: '' }]);
    }
  }, [member]);

  // When user selects a file, show the cropper
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }

    // Create object URL for cropping
    const objectUrl = URL.createObjectURL(file);
    setImageToCrop(objectUrl);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setShowCropper(true);

    // Reset file input
    e.target.value = '';
  };

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  // Save the cropped image
  const handleSaveCrop = async () => {
    if (!imageToCrop || !croppedAreaPixels) return;

    setImageUploading(true);
    try {
      // Create cropped blob
      const croppedBlob = await createCroppedImage(imageToCrop, croppedAreaPixels);

      // Create file from blob
      const file = new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' });

      // Upload to server
      const result = await api.uploadFile(file);
      setImageUrl(result.url);

      // Clean up
      URL.revokeObjectURL(imageToCrop);
      setShowCropper(false);
      setImageToCrop(null);
    } catch (err) {
      alert(err.message || 'Failed to upload image');
    } finally {
      setImageUploading(false);
    }
  };

  const handleCancelCrop = () => {
    URL.revokeObjectURL(imageToCrop);
    setShowCropper(false);
    setImageToCrop(null);
  };

  const handleStintChange = (index, field, value) => {
    setStints(prev => prev.map((stint, i) =>
      i === index ? { ...stint, [field]: value } : stint
    ));
  };

  const toggleInstrument = (index, instrument) => {
    setStints(prev => prev.map((stint, i) => {
      if (i !== index) return stint;
      const instruments = stint.instruments.includes(instrument)
        ? stint.instruments.filter(inst => inst !== instrument)
        : [...stint.instruments, instrument];
      return { ...stint, instruments };
    }));
  };

  const toggleGuestInstrument = (instrument) => {
    setGuestInstruments(prev =>
      prev.includes(instrument)
        ? prev.filter(inst => inst !== instrument)
        : [...prev, instrument]
    );
  };

  const addStint = () => {
    setStints(prev => [...prev, { instruments: [], startDate: '', endDate: '' }]);
  };

  const removeStint = (index) => {
    if (stints.length > 1) {
      setStints(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Validate
    if (!name) return;
    const validStints = stints.filter(s => s.instruments.length > 0 && s.startDate);

    // Guests don't need stints, regular members need valid stints
    if (!isGuest && validStints.length === 0) return;

    onSave({
      name,
      notes: notes || null,
      imageUrl: imageUrl || null,
      isGuest,
      linkedUserId: linkedUserId || null,
      // Guests have NO stints - instruments stored separately if needed
      // Regular members have stints with dates
      stints: isGuest ? [] : validStints.map(s => ({
        instruments: s.instruments,
        startDate: s.startDate,
        endDate: s.endDate || null
      }))
    });
  };

  // Guests only need a name (instruments optional), regular members need stints
  const isValid = name && (isGuest || stints.some(s => s.instruments.length > 0 && s.startDate));

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-gray-300 text-sm font-medium mb-2">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Member name"
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
            required
          />
        </div>

        {/* Link to Workspace User */}
        {workspaceMembers.length > 0 && (
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Link to User Account
            </label>
            <select
              value={linkedUserId}
              onChange={(e) => setLinkedUserId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white"
            >
              <option value="">No linked account</option>
              {workspaceMembers.map(m => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.displayName} ({m.user.email})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Link to a workspace member to show their profile and badges when clicked.
            </p>
          </div>
        )}

        {/* Photo Upload */}
        <div>
          <label className="block text-gray-300 text-sm font-medium mb-2">
            Photo
          </label>
          <div className="flex items-start gap-4">
            {/* Photo Preview */}
            <div className="flex-shrink-0">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={name || 'Member'}
                  className="w-16 h-16 rounded-full object-cover border-2 border-gray-600"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 text-2xl font-medium border-2 border-gray-600">
                  {name?.charAt(0).toUpperCase() || '?'}
                </div>
              )}
            </div>
            <div className="flex-1">
              <label className="block">
                <span className="btn btn-secondary cursor-pointer inline-block text-sm">
                  {imageUploading ? 'Uploading...' : 'Upload Photo'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  disabled={imageUploading}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-gray-500 mt-1">Max 10MB. JPG, PNG, GIF.</p>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="text-xs text-red-400 hover:text-red-300 mt-1"
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isGuest}
              onChange={(e) => setIsGuest(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-gray-300 text-sm font-medium">Guest Member</span>
            <span className="text-gray-500 text-xs">(session/touring musician)</span>
          </label>
        </div>

        {/* Info for guests */}
        {isGuest && (
          <p className="text-gray-500 text-sm">
            Guests are session/touring musicians who don't have formal membership stints.
          </p>
        )}

        {/* Only show stints section for non-guest members */}
        {!isGuest && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-300 text-sm font-medium">
                Instrument Stints <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={addStint}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                + Add Stint
              </button>
            </div>

            <div className="space-y-3">
              {stints.map((stint, index) => (
                <div key={index} className="p-3 bg-gray-900 border border-gray-700 rounded-lg">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 space-y-3">
                      {/* Instrument checkboxes */}
                      <div>
                        <label className="block text-gray-400 text-xs mb-2">Instruments (select all that apply)</label>
                        <div className="flex flex-wrap gap-2">
                          {INSTRUMENTS.map(inst => (
                            <button
                              key={inst}
                              type="button"
                              onClick={() => toggleInstrument(index, inst)}
                              className={`px-2 py-1 text-xs rounded transition-colors ${
                                stint.instruments.includes(inst)
                                  ? 'bg-green-600 text-white'
                                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              }`}
                            >
                              {inst}
                            </button>
                          ))}
                        </div>
                        {stint.instruments.length > 0 && (
                          <div className="mt-2 text-sm text-green-400">
                            Selected: {stint.instruments.join(', ')}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-gray-400 text-xs mb-1">From</label>
                          <input
                            type="date"
                            value={stint.startDate}
                            onChange={(e) => handleStintChange(index, 'startDate', e.target.value)}
                            className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-gray-400 text-xs mb-1">To (empty = present)</label>
                          <input
                            type="date"
                            value={stint.endDate}
                            onChange={(e) => handleStintChange(index, 'endDate', e.target.value)}
                            className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    {stints.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStint(index)}
                        className="text-red-400 hover:text-red-300 p-1"
                        title="Remove stint"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-gray-300 text-sm font-medium mb-2">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes..."
            rows={2}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white resize-none"
          />
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-secondary"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !isValid}
            className="btn bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-600"
          >
            {loading ? 'Saving...' : (member ? 'Update Member' : 'Add Member')}
          </button>
        </div>
      </form>

      {/* Image Cropper Modal */}
      {showCropper && (
        <div className="fixed inset-0 bg-black/80 flex flex-col z-[100]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-700">
            <h3 className="text-white font-medium">Adjust Photo</h3>
            <button
              onClick={handleCancelCrop}
              className="text-gray-400 hover:text-white text-2xl"
            >
              &times;
            </button>
          </div>

          {/* Cropper Area */}
          <div className="flex-1 relative">
            <Cropper
              image={imageToCrop}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
            />
          </div>

          {/* Controls */}
          <div className="p-4 bg-gray-900 border-t border-gray-700">
            <div className="max-w-md mx-auto space-y-4">
              {/* Zoom slider */}
              <div className="flex items-center gap-3">
                <span className="text-gray-400 text-sm w-12">Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-green-500"
                />
                <span className="text-gray-400 text-sm w-12 text-right">{zoom.toFixed(1)}x</span>
              </div>

              {/* Instructions */}
              <p className="text-gray-500 text-xs text-center">
                Drag to reposition. Use slider or scroll to zoom.
              </p>

              {/* Buttons */}
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleCancelCrop}
                  className="btn btn-secondary"
                  disabled={imageUploading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCrop}
                  disabled={imageUploading}
                  className="btn bg-green-600 hover:bg-green-700 text-white"
                >
                  {imageUploading ? 'Saving...' : 'Save Photo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default BandMemberForm;
