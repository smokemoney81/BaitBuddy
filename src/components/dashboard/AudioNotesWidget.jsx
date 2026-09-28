import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, Play, Pause, Download } from 'lucide-react';
import { toast } from 'sonner';
import { addToOfflineNotesQueue, getOfflineNotesQueue, removeFromOfflineNotesQueue, isOnline } from '@/components/utils/offlineSync';
import { useHaptic } from '@/components/utils/HapticFeedback';
import { useSound } from '@/components/utils/SoundManager';
import { api as apiClient } from '@/api/frontendClient';

const noteKey = note => note.id ?? note.__id;

function formatNoteDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function AudioNotesWidget() {
  const [isRecording, setIsRecording] = useState(false);
  const [notes, setNotes] = useState([]);
  const [playingId, setPlayingId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const currentAudioRef = useRef(null);
  const { triggerHaptic } = useHaptic();
  const { playSound } = useSound();

  // Beim Öffnen laden und erneut, wenn die App wieder in den Vordergrund kommt
  // oder das Netz zurück ist. Früher lief hier ein 10-Sekunden-Polling gegen
  // den Server, solange das Dashboard offen war.
  useEffect(() => {
    loadNotes();
    const onVisible = () => { if (document.visibilityState === 'visible') loadNotes(); };
    window.addEventListener('online', loadNotes);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', loadNotes);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Beim Verlassen der Seite Aufnahme und Wiedergabe beenden — sonst bliebe das
  // Mikrofon nach einem Seitenwechsel mitten in der Aufnahme offen.
  useEffect(() => () => {
    try {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
    } catch { /* bereits beendet */ }
    streamRef.current?.getTracks().forEach(track => track.stop());
    currentAudioRef.current?.pause();
  }, []);

  const loadNotes = async () => {
    try {
      setIsLoading(true);
      if (isOnline()) {
        const data = await apiClient.get('/api/dashboard-account-notes');
        setNotes(Array.isArray(data) ? data : []);
      } else {
        const queue = getOfflineNotesQueue();
        setNotes(queue);
      }
    } catch (error) {
      console.error('Fehler beim Laden der Notizen:', error);
      const queue = getOfflineNotesQueue();
      setNotes(queue);
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      triggerHaptic('medium');
      playSound('click');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        // Safari/iOS nimmt audio/mp4 auf — den tatsächlichen Typ übernehmen.
        const mimeType = (mediaRecorder.mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const reader = new FileReader();

        reader.onloadend = async () => {
          const base64 = reader.result.split(',')[1];
          const noteData = {
            audio_data: base64,
            duration_ms: mediaRecorderRef.current?.duration || 0,
            mime_type: mimeType,
            title: `Notiz ${new Date().toLocaleTimeString('de-DE')}`,
          };

          try {
            if (isOnline()) {
              await apiClient.post('/api/dashboard-account-notes', noteData);
              toast.success('Audionotiz gespeichert');
            } else {
              addToOfflineNotesQueue(noteData);
              toast.success('Audionotiz lokal gespeichert (wird synchronisiert)');
            }
          } catch (error) {
            console.error('Fehler beim Speichern der Notiz:', error);
            addToOfflineNotesQueue(noteData);
            toast.info('Audionotiz lokal gespeichert (Server nicht erreichbar)');
          }

          loadNotes();
          triggerHaptic('light');
          playSound('success');
        };

        reader.readAsDataURL(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (error) {
      console.error('Fehler beim Starten der Aufnahme:', error);
      triggerHaptic('light');
      playSound('error');
      toast.error('Mikrofon nicht verfügbar');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      triggerHaptic('light');
      playSound('click');
    }
  };

  const playNote = async (note) => {
    try {
      triggerHaptic('light');

      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }

      if (playingId === noteKey(note)) {
        setPlayingId(null);
        return;
      }

      const audio = new Audio(`data:${note.mime_type};base64,${note.audio_data}`);
      currentAudioRef.current = audio;

      audio.onended = () => { currentAudioRef.current = null; setPlayingId(null); };
      audio.onpause = () => setPlayingId(null);

      setPlayingId(noteKey(note));
      await audio.play();
    } catch (error) {
      currentAudioRef.current = null;
      setPlayingId(null);
      console.error('Fehler beim Abspielen:', error);
      toast.error('Fehler beim Abspielen der Notiz');
    }
  };

  const downloadNote = (note) => {
    triggerHaptic('light');
    const link = document.createElement('a');
    link.href = `data:${note.mime_type};base64,${note.audio_data}`;
    link.download = `${note.title}.${String(note.mime_type || '').includes('mp4') ? 'm4a' : 'webm'}`;
    link.click();
  };

  // Server-Notizen tragen `id`, noch nicht synchronisierte Notizen aus der
  // Offline-Warteschlange `__id` — beide lassen sich löschen.
  const deleteNote = async (note) => {
    triggerHaptic('light');
    try {
      if (note.__id) {
        removeFromOfflineNotesQueue(note.__id);
        toast.success('Notiz lokal gelöscht');
      } else {
        await apiClient.del(`/api/dashboard-account-notes/${note.id}`);
        toast.success('Notiz gelöscht');
      }
    } catch (error) {
      console.error('Fehler beim Löschen der Notiz:', error);
      toast.error('Notiz konnte nicht gelöscht werden.');
    }
    loadNotes();
  };

  return (
    <section className="bb-home-tile bb-home-tile-wide bb-home-notes" aria-label="Audionotizen">
      <div className="bb-home-tile-row">
        <span className="bb-home-tile-icon"><Mic size={18} aria-hidden="true" /></span>
        <span className="flex-1 min-w-0">
          <span className="bb-home-tile-label">Audionotizen{!isOnline() ? ' · offline' : ''}</span>
          <span className="bb-home-tile-meta">
            {isLoading ? 'Wird geladen …' : notes.length ? `${notes.length} Notiz${notes.length !== 1 ? 'en' : ''}` : 'Noch keine Notizen'}
          </span>
        </span>
        {!isRecording ? (
          <button type="button" onClick={startRecording} className="bb-home-tile-btn">
            <Mic size={16} aria-hidden="true" />Aufnehmen
          </button>
        ) : (
          <button type="button" onClick={stopRecording} className="bb-home-tile-btn is-recording">
            <Square size={16} aria-hidden="true" />Stopp
          </button>
        )}
      </div>

      {!isLoading && notes.length > 0 && (
        <ul className="bb-home-notes-list">
          {notes.map((note) => (
            <li key={noteKey(note)}>
              <button type="button" onClick={() => playNote(note)} className="bb-home-icon-btn" aria-label={playingId === noteKey(note) ? `${note.title} pausieren` : `${note.title} abspielen`}>
                {playingId === noteKey(note) ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              </button>
              <span className="flex-1 min-w-0">
                <span className="bb-home-notes-title">{note.title}</span>
                <span className="bb-home-tile-meta">{formatNoteDate(note.created_at || note.__created)}</span>
              </span>
              <button type="button" onClick={() => downloadNote(note)} className="bb-home-icon-btn" aria-label={`${note.title} herunterladen`}>
                <Download size={16} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => deleteNote(note)} className="bb-home-icon-btn is-danger" aria-label={`${note.title} löschen`}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
