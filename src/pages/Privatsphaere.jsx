import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Mic, Camera, MapPin, Headphones, AudioLines, FileAudio, Video, ShieldCheck,
  Settings as SettingsIcon, Trash2, CloudDownload, ChevronRight,
} from 'lucide-react';
import PageTitle from '@/components/layout/PageTitle';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PERMISSION_KINDS, queryPermission, requestPermission, watchPermission } from '@/lib/devicePermissions';
import { readPrivacyPrefs, writePrivacyPrefs, clearLocalCaches } from '@/lib/privacyPrefs';

const PERMISSIONS = {
  microphone: { icon: Mic, title: 'Mikrofon', text: 'Für Sprachsteuerung, Voice-Buddy und Hands-free Buddy.' },
  camera: { icon: Camera, title: 'Kamera', text: 'Für Fangfotos, CatchCam, AR-Ansichten und die Bisserkennung.' },
  geolocation: { icon: MapPin, title: 'Standort', text: 'Für Karte, Spots, Wetter vor Ort und Trips.' },
};

const STATE_LABEL = {
  granted: { word: 'aktiv', tone: 'on' },
  denied: { word: 'blockiert', tone: 'off' },
  prompt: { word: 'aus', tone: 'off' },
  unknown: { word: 'unbekannt', tone: 'neutral' },
  unsupported: { word: 'nicht verfügbar', tone: 'neutral' },
};

const REVOKE_HINT = 'Eine erteilte Berechtigung kann nur das System entziehen: Einstellungen > Apps > BaitBuddy > Berechtigungen (im Browser: Schloss-Symbol neben der Adresse).';

function PrivacyTile({ icon: Icon, title, word, tone, text, control, wide = false }) {
  return (
    <div className={`bb-card bb-priv-tile is-${tone}${wide ? ' is-wide' : ''}`}>
      <span className="bb-priv-ring" aria-hidden="true"><Icon size={26} /></span>
      <div className="bb-priv-body">
        <p className="bb-priv-title">{title} {word && <span className="bb-priv-state">{word}</span>}</p>
        <p className="bb-priv-text">{text}</p>
      </div>
      {control && <div className="bb-priv-control">{control}</div>}
    </div>
  );
}

function ActionRow({ icon: Icon, title, text, tone = '', onClick, to }) {
  const content = (
    <>
      <Icon size={28} aria-hidden="true" className="bb-priv-action-icon" />
      <span className="flex-1 min-w-0">
        <strong className="block">{title}</strong>
        <span className="bb-priv-action-text">{text}</span>
      </span>
      <ChevronRight size={22} aria-hidden="true" />
    </>
  );
  const className = `bb-card bb-priv-action${tone ? ` is-${tone}` : ''}`;
  return to
    ? <Link to={to} className={className}>{content}</Link>
    : <button type="button" onClick={onClick} className={className}>{content}</button>;
}

export default function Privatsphaere() {
  const queryClient = useQueryClient();
  const [states, setStates] = useState({ microphone: 'unknown', camera: 'unknown', geolocation: 'unknown' });
  const [prefs, setPrefs] = useState(() => readPrivacyPrefs());
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(async () => {
    const entries = await Promise.all(PERMISSION_KINDS.map(async kind => [kind, await queryPermission(kind)]));
    const next = Object.fromEntries(entries);
    setStates(next);
    return next;
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribers = [];
    let alive = true;
    PERMISSION_KINDS.forEach(kind => {
      watchPermission(kind, state => setStates(prev => ({ ...prev, [kind]: state }))).then(unsub => {
        if (alive) unsubscribers.push(unsub); else unsub();
      });
    });
    return () => { alive = false; unsubscribers.forEach(unsub => unsub()); };
  }, [refresh]);

  const togglePermission = async (kind, wantOn) => {
    if (!wantOn) {
      toast.info(REVOKE_HINT);
      return;
    }
    const result = await requestPermission(kind);
    setStates(prev => ({ ...prev, [kind]: result }));
    if (result === 'denied') toast.error(`${PERMISSIONS[kind].title} ist blockiert. ${REVOKE_HINT.replace('entziehen', 'ändern')}`);
    if (result === 'unsupported') toast.error(`${PERMISSIONS[kind].title} ist auf diesem Gerät nicht verfügbar.`);
  };

  const setPref = (key, value) => setPrefs(writePrivacyPrefs({ [key]: value }));

  const checkAll = async () => {
    const next = await refresh();
    const granted = PERMISSION_KINDS.filter(kind => next[kind] === 'granted').map(kind => PERMISSIONS[kind].title);
    toast.success(granted.length ? `Freigegeben: ${granted.join(', ')}.` : 'Aktuell ist keine Berechtigung freigegeben.', {
      description: 'Ändern kannst du das unter Einstellungen > Apps > BaitBuddy > Berechtigungen.',
    });
  };

  const clearData = async () => {
    setClearing(true);
    try {
      const removed = await clearLocalCaches();
      queryClient.clear();
      toast.success(removed ? 'Zwischenspeicher gelöscht.' : 'Es war nichts zwischengespeichert.');
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  };

  return (
    <div className="bb-page bb-priv">
      <PageTitle
        title="Privatsphäre & Berechtigungen"
        subtitle="Du hast die Kontrolle. Deine Daten. Dein Fang. Deine Entscheidung."
      />

      <div className="bb-priv-grid">
        {PERMISSION_KINDS.map(kind => {
          const meta = PERMISSIONS[kind];
          const label = STATE_LABEL[states[kind]] || STATE_LABEL.unknown;
          return (
            <PrivacyTile
              key={kind}
              icon={meta.icon}
              title={meta.title}
              word={label.word}
              tone={label.tone}
              text={meta.text}
              control={(
                <Switch
                  className="bb-switch"
                  checked={states[kind] === 'granted'}
                  disabled={states[kind] === 'unsupported'}
                  onCheckedChange={value => togglePermission(kind, value)}
                  aria-label={`${meta.title}-Berechtigung`}
                />
              )}
            />
          );
        })}
        <PrivacyTile
          icon={Headphones}
          title="Hands-free Buddy"
          word={prefs.handsFree ? 'an' : 'aus'}
          tone={prefs.handsFree ? 'on' : 'off'}
          text="Sprachassistent während eines Trips, ohne Tippen."
          control={<Switch className="bb-switch" checked={prefs.handsFree} onCheckedChange={value => setPref('handsFree', value)} aria-label="Hands-free Buddy erlauben" />}
        />
        <PrivacyTile
          icon={AudioLines}
          title="Aktivierungswort"
          word={prefs.handsFree && prefs.wakeWord ? 'an' : 'aus'}
          tone={prefs.handsFree && prefs.wakeWord ? 'on' : 'off'}
          text="Im Hands-free-Modus auf „Hey Buddy“ hören. Die Erkennung übernimmt die Spracherkennung deines Geräts (unter Android der Google-Sprachdienst)."
          control={<Switch className="bb-switch" checked={prefs.handsFree && prefs.wakeWord} disabled={!prefs.handsFree} onCheckedChange={value => setPref('wakeWord', value)} aria-label="Aktivierungswort Hey Buddy" />}
        />
        <PrivacyTile
          icon={FileAudio}
          title="Sprachbefehle speichern:"
          word="Aus"
          tone="off"
          text="Was du dem Buddy sagst, wird nicht aufgezeichnet. Gespeichert werden nur Audionotizen, die du selbst aufnimmst."
        />
        <PrivacyTile
          wide
          icon={Video}
          title="Daueraufnahme:"
          word="Aus"
          tone="off"
          text="Kamera und Mikrofon laufen nur, solange du eine Funktion wie Hands-free Buddy oder die Bisserkennung geöffnet hast. Im Hintergrund nimmt BaitBuddy nichts auf."
        />
      </div>

      <section className="bb-card bb-priv-info">
        <ShieldCheck size={56} aria-hidden="true" className="bb-priv-info-icon" />
        <div>
          <h2 className="bb-priv-info-title">Deine Privatsphäre ist uns wichtig</h2>
          <p className="bb-priv-text">
            Du entscheidest, welche Funktionen Zugriff erhalten. Für KI-Antworten und Sprachausgabe
            leitet unser Server deine Anfrage an die KI- und Sprachdienste weiter, die in der
            Datenschutzerklärung genannt sind.
          </p>
          <Link to="/Datenschutz" className="bb-see-all">Mehr erfahren <ChevronRight size={16} aria-hidden="true" /></Link>
        </div>
      </section>

      <div className="bb-priv-actions">
        <ActionRow icon={SettingsIcon} title="Berechtigungen prüfen" text="Aktuellen Stand abfragen und erfahren, wo du ihn änderst." tone="accent" onClick={checkAll} />
        <ActionRow icon={Trash2} title="Zwischenspeicher löschen" text="Offline-Karten, Offline-Paket und Caches entfernen." tone="danger" onClick={() => setConfirmClear(true)} />
        <ActionRow icon={CloudDownload} title="Offline-Modus verwalten" text="Daten für Angeln ohne Netz herunterladen." to="/OfflineFishingPack" />
      </div>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent className="bb-app">
          <AlertDialogHeader>
            <AlertDialogTitle>Zwischenspeicher löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Gelöscht werden heruntergeladene Offline-Karten, das Offline-Paket und die App-Caches.
              Deine Anmeldung, deine Einstellungen und alles, was noch nicht mit dem Server
              abgeglichen ist, bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction disabled={clearing} onClick={event => { event.preventDefault(); clearData(); }}>
              {clearing ? 'Wird gelöscht …' : 'Löschen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
