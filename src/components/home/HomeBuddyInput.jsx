import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Image as ImageIcon, Mic, SendHorizontal } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import DashboardQuickActions from '@/components/dashboard/DashboardQuickActions';
import { trackFeatureClick } from '@/components/utils/tracker';
import { buddyAskUrl } from '@/components/home/HomePromptChips';

// Leuchtende Wellenlinien um die Eingabeleiste (Vorlage). Rein dekorativ.
function InputWaves() {
  return (
    <svg className="bb-home-input-waves" viewBox="0 0 400 80" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 40 C 40 18, 80 62, 120 40 S 200 18, 240 40 S 320 62, 360 40 S 400 30, 400 40" />
      <path d="M0 44 C 50 64, 90 22, 140 42 S 220 64, 270 42 S 350 22, 400 44" />
      <path d="M0 36 C 60 24, 110 54, 170 38 S 280 22, 330 38 S 390 50, 400 36" />
    </svg>
  );
}

// Eingabeleiste der Startseite: Plus (Schnellzugriffe), Frage-Feld, Foto
// (Fisch per Kamera erkennen) und Mikrofon. Mit getipptem Text wird das
// Mikrofon zum Senden-Knopf. Fragen landen sofort im KI-Buddy.
export default function HomeBuddyInput() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);
  const question = value.trim();

  const submit = (event) => {
    event.preventDefault();
    if (!question) return;
    trackFeatureClick('KiBuddyBeta', { source: 'dashboard_input' });
    navigate(buddyAskUrl(question));
  };

  const startVoice = () => {
    trackFeatureClick('KiBuddyBeta', { source: 'dashboard_voice' });
    navigate('/KiBuddyBeta?mode=text&ask=1&listen=1');
  };

  const openPhoto = () => {
    trackFeatureClick('CatchCam', { source: 'dashboard_input_photo' });
    navigate('/CatchCam');
  };

  return (
    <div className="bb-home-input-wrap">
      <InputWaves />
      <form className="bb-home-input" onSubmit={submit} role="search" aria-label="Frag deinen Buddy">
        <button type="button" className="bb-home-input-plus" onClick={() => setQuickOpen(true)} aria-label="Schnellzugriffe öffnen">
          <Plus size={26} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <div className={`bb-home-input-field${question ? ' has-value' : ''}`}>
          <input
            type="text"
            value={value}
            onChange={event => setValue(event.target.value)}
            placeholder="Frag deinen Buddy ..."
            enterKeyHint="send"
            maxLength={500}
            aria-label="Frag deinen Buddy"
          />
          <button type="button" className="bb-home-input-photo" onClick={openPhoto} aria-label="Foto analysieren: Fisch erkennen">
            <ImageIcon size={22} strokeWidth={1.7} aria-hidden="true" />
          </button>
        </div>
        {question ? (
          <button type="submit" className="bb-home-input-mic is-send" aria-label="Frage senden">
            <SendHorizontal size={20} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" className="bb-home-input-mic" onClick={startVoice} aria-label="Spracheingabe starten">
            <Mic size={22} strokeWidth={1.8} aria-hidden="true" />
          </button>
        )}
      </form>

      <Sheet open={quickOpen} onOpenChange={setQuickOpen}>
        <SheetContent side="bottom" className="bb-quick-sheet bb-home-quick-sheet">
          <SheetTitle className="bb-home-quick-title">Schnellzugriffe</SheetTitle>
          <SheetDescription className="sr-only">Häufige Aktionen direkt starten.</SheetDescription>
          <DashboardQuickActions onNavigate={() => setQuickOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
