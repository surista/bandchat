import { useState, useRef, useEffect } from 'react';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

export default function ReactionPicker({ onSelect, onClose }) {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setShowPicker(false);
        onClose?.();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const handleSelect = (emoji) => {
    onSelect(emoji);
    setShowPicker(false);
  };

  return (
    <div ref={pickerRef} className="relative">
      <div className="flex items-center gap-0.5 bg-gray-800 rounded-lg p-1 shadow-lg border border-gray-600">
        {QUICK_REACTIONS.map(emoji => (
          <button
            key={emoji}
            onClick={() => handleSelect(emoji)}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-700 rounded transition-colors text-lg"
            title={`React with ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
