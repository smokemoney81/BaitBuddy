import { useState, useEffect } from 'react';
import { useElevenLabsVoice } from '@/hooks/useElevenLabsVoice';
import { getPersonalizedGreeting, getMotivationalGreeting } from '@/components/utils/greetings';

export function VoiceGreeting({ user, fullGreeting = false }) {
  const [_isAutoPlaying, setIsAutoPlaying] = useState(false);
  const { speak, isSpeaking, stop } = useElevenLabsVoice();

  const greeting = fullGreeting
    ? getMotivationalGreeting(user)
    : getPersonalizedGreeting(user);

  // Auto-play greeting on mount
  useEffect(() => {
    setIsAutoPlaying(true);
    speak(greeting).finally(() => setIsAutoPlaying(false));

    return () => stop();
  }, [user, greeting, fullGreeting, speak, stop]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 16px',
      background: 'rgba(34, 211, 200, 0.1)',
      borderRadius: 8,
      border: '1px solid rgba(34, 211, 200, 0.3)',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: '#22d3c8',
          marginBottom: 4,
        }}>
          {greeting.split('\n')[0]}
        </div>
        {greeting.includes('\n') && (
          <div style={{
            fontSize: 12,
            color: '#8899aa',
            lineHeight: 1.4,
          }}>
            {greeting.split('\n').slice(1).join(' ')}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button"
          onClick={() => !isSpeaking ? speak(greeting) : stop()}
          style={{
            background: isSpeaking ? '#22d3c8' : '#0d1a2a',
            border: '1px solid #22d3c8',
            borderRadius: 6,
            padding: '6px 12px',
            color: isSpeaking ? '#060d1a' : '#22d3c8',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {isSpeaking ? 'Stopp' : 'Hören'}
        </button>
      </div>
    </div>
  );
}
