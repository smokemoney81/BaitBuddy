import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useVoiceMuted } from '@/hooks/useVoiceActivity';

// Lautlos-Taste für die Buddy-Stimme (global, gilt für die ganze App).
export default function VoiceMuteButton({ className = '' }) {
  const [muted, setMuted] = useVoiceMuted();
  const label = muted ? 'Vorlesen einschalten' : 'Lautlos schalten';
  return (
    <button
      type="button"
      onClick={() => setMuted(!muted)}
      aria-pressed={muted}
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        muted
          ? 'border-gray-600 bg-gray-800/70 text-gray-300'
          : 'border-cyan-400/60 bg-cyan-950/40 text-cyan-300'
      } ${className}`}
    >
      {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
      {muted ? 'Lautlos' : 'Vorlesen an'}
    </button>
  );
}
