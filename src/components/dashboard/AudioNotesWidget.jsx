import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Trash2, Play, Pause, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { addToOfflineNotesQueue, getOfflineNotesQueue, removeFromOfflineNotesQueue, isOnline } from '@/components/utils/offlineSync';
import { useHaptic } from '@/components/utils/HapticFeedback';
import { useSound } from '@/components/utils/SoundManager';
import { api as apiClient } from '@/api/frontendClient';

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

  // Load persisted notes on mount
  useEffect(() => {
    loadNotes();
    const interval = setInterval(() => {
      if (isOnline()) {
        loadNotes();
      }
    }, 10000); // Refresh every 10 seconds when online
    return () => clearInterval(interval);
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
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();

        reader.onloadend = async () => {
          const base64 = reader.result.split(',')[1];
          const noteData = {
            audio_data: base64,
            duration_ms: mediaRecorderRef.current?.duration || 0,
            mime_type: 'audio/webm',
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

      if (playingId === note.id) {
        setPlayingId(null);
        return;
      }

      const audio = new Audio(`data:${note.mime_type};base64,${note.audio_data}`);
      currentAudioRef.current = audio;

      audio.onended = () => { currentAudioRef.current = null; setPlayingId(null); };
      audio.onpause = () => setPlayingId(null);

      setPlayingId(note.id);
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
    link.download = `${note.title}.webm`;
    link.click();
  };

  const deleteNote = async (noteId) => {
    triggerHaptic('light');
    try {
      if (isOnline()) {
        await apiClient.del(`/api/dashboard-account-notes/${noteId}`);
        toast.success('Notiz gelöscht');
      } else {
        removeFromOfflineNotesQueue(noteId);
        toast.success('Notiz lokal gelöscht');
      }
    } catch (error) {
      console.error('Fehler beim Löschen der Notiz:', error);
      removeFromOfflineNotesQueue(noteId);
      toast.success('Notiz gelöscht');
    }
    loadNotes();
  };

  return (
    <Card className="bb-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Mic className="w-5 h-5 text-cyan-300" />
          <h3 className="font-semibold text-slate-50">Audionotizen</h3>
          {!isOnline() && (
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">Offline</span>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {!isRecording ? (
          <Button
            onClick={startRecording}
            className="bb-action flex-1 gap-2"
            size="sm"
          >
            <Mic className="w-4 h-4" />
            Aufnahme starten
          </Button>
        ) : (
          <Button
            onClick={stopRecording}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white gap-2 animate-pulse"
            size="sm"
          >
            <Square className="w-4 h-4" />
            Aufnahme stoppen
          </Button>
        )}
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto">
        {isLoading ? (
          <p className="text-sm text-slate-400 text-center py-4">
            Notizen werden geladen...
          </p>
        ) : notes.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">
            Keine Audionotizen vorhanden
          </p>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/60 border border-cyan-400/20 hover:border-cyan-400/50"
            >
              <button type="button"
                onClick={() => playNote(note)}
                className="p-1.5 hover:bg-cyan-400/10 rounded-lg transition"
              >
                {playingId === note.id ? (
                  <Pause className="w-4 h-4 text-cyan-300" />
                ) : (
                  <Play className="w-4 h-4 text-cyan-300" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-100 truncate">
                  {note.title}
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(note.created_at).toLocaleTimeString('de-DE')}
                </p>
              </div>

              <button type="button"
                onClick={() => downloadNote(note)}
                className="p-1 hover:bg-white/5 rounded transition"
                title="Herunterladen"
              >
                <Download className="w-4 h-4 text-slate-300" />
              </button>

              <button type="button"
                onClick={() => deleteNote(note.id)}
                className="p-1 hover:bg-red-500/10 rounded transition"
                title="Löschen"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
              </button>
            </div>
          ))
        )}
      </div>

      {notes.length > 0 && (
        <p className="text-xs text-slate-400 mt-3 text-center">
          {notes.length} Notiz{notes.length !== 1 ? 'en' : ''}
        </p>
      )}
    </Card>
  );
}
