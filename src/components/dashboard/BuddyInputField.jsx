import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Send } from 'lucide-react';
import { generateSuggestions } from '@/lib/buddyPromptSuggestions';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import BuddyAvatar from '@/components/ai/BuddyAvatar';
import { trackFeatureClick } from '@/components/utils/tracker';

const ROTATE_MS = 4000;

export default function BuddyInputField({ weather, catches, trips, targetSpecies }) {
  const navigate = useNavigate();
  const { activeBuddy } = useBuddyPreferences();
  const [value, setValue] = useState('');
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  const [fadeClass, setFadeClass] = useState('bb-suggest-in');
  const inputRef = useRef(null);

  const suggestions = React.useMemo(
    () => generateSuggestions({ weather, catches, trips, targetSpecies }),
    [weather, catches, trips, targetSpecies]
  );

  useEffect(() => {
    if (value || suggestions.length <= 1) return;
    const id = setInterval(() => {
      setFadeClass('bb-suggest-out');
      setTimeout(() => {
        setSuggestionIdx(i => (i + 1) % suggestions.length);
        setFadeClass('bb-suggest-in');
      }, 300);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [value, suggestions.length]);

  const submit = useCallback(() => {
    const q = value.trim() || suggestions[suggestionIdx];
    if (!q) return;
    trackFeatureClick('KiBuddyBeta', { source: 'dashboard_input' });
    navigate(`/KiBuddyBeta?question=${encodeURIComponent(q)}`);
  }, [value, suggestions, suggestionIdx, navigate]);

  const openVoice = useCallback(() => {
    trackFeatureClick('KiBuddyBeta', { source: 'dashboard_voice' });
    navigate('/KiBuddyBeta?voice=1');
  }, [navigate]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  };

  return (
    <div className="bb-buddy-input-wrapper">
      <div className="bb-buddy-input-avatar">
        <BuddyAvatar size={40} />
      </div>
      <div className="bb-buddy-input-field">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="bb-buddy-input"
          aria-label={`Frag ${activeBuddy.name}`}
        />
        {!value && suggestions.length > 0 && (
          <span className={`bb-buddy-placeholder ${fadeClass}`} aria-hidden="true">
            {suggestions[suggestionIdx]}
          </span>
        )}
      </div>
      <button
        type="button"
        className="bb-buddy-input-btn bb-buddy-voice-btn"
        onClick={openVoice}
        aria-label="Spracheingabe"
      >
        <Mic size={18} />
      </button>
      <button
        type="button"
        className="bb-buddy-input-btn bb-buddy-send-btn"
        onClick={submit}
        aria-label="Frage senden"
      >
        <Send size={18} />
      </button>
    </div>
  );
}
