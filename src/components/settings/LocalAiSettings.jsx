import React, { useState } from 'react';
import { Cpu, Cloud, Sparkles, Download, Pause, Trash2, Check, Loader2, ShieldCheck, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { useLocalLlmStatus } from '@/hooks/useLocalBuddy';
import {
  formatBytes,
  getPreferredModelId,
  pickReadyModel,
  setAiMode,
  setPreferredModelId,
} from '@/lib/localLlm/localModel';

const MODES = [
  { id: 'auto', icon: Sparkles, title: 'Automatisch', text: 'Cloud-KI, solange Internet da ist. Ohne Netz oder bei Ausfall antwortet dein Handy.' },
  { id: 'device', icon: Cpu, title: 'Nur auf dem Gerät', text: 'Deine Fragen gehen an keine Cloud-KI. Antworten dauern länger als in der Cloud.' },
  { id: 'cloud', icon: Cloud, title: 'Nur Cloud', text: 'Immer die Cloud-KI. Ohne Netz antwortet der Buddy aus seinem eingebauten Wissen.' },
];

const STATE_LABEL = {
  absent: 'Nicht geladen',
  paused: 'Pausiert',
  downloading: 'Wird geladen',
  verifying: 'Wird geprüft',
  ready: 'Bereit',
  error: 'Fehler',
};

const ERROR_LABEL = {
  insufficient_storage: 'Zu wenig freier Speicher auf dem Gerät.',
  insufficient_ram: 'Dein Gerät hat für dieses Modell zu wenig Arbeitsspeicher.',
  unsupported_abi: 'Dein Gerät unterstützt die KI auf dem Gerät nicht.',
  checksum_mismatch: 'Die geladene Datei war beschädigt und wurde verworfen. Bitte erneut laden.',
  network: 'Verbindung unterbrochen. Tippe auf Fortsetzen, der Download macht an derselben Stelle weiter.',
  size_mismatch: 'Die Datei kam unvollständig an. Bitte erneut laden.',
};

const UNSUPPORTED_REASON = {
  unsupported_abi: 'Dein Gerät hat einen 32-Bit-Prozessor. Die KI auf dem Gerät braucht ein 64-Bit-Gerät.',
  insufficient_ram: 'Dein Gerät hat zu wenig Arbeitsspeicher für die KI auf dem Gerät (nötig sind mindestens 6 GB).',
};

export default function LocalAiSettings() {
  const { native, status, loading, mode, download, cancelDownload, remove } = useLocalLlmStatus();
  const [consentFor, setConsentFor] = useState(null);
  const [deleteFor, setDeleteFor] = useState(null);
  const [preferred, setPreferred] = useState(getPreferredModelId);

  const supported = !!status?.supported;
  const readyModel = pickReadyModel(status, preferred);

  const chooseMode = (id) => {
    if (id === 'device' && !readyModel) {
      toast.error('Lade zuerst ein Modell herunter, dann kann dein Buddy auf dem Gerät antworten.');
      return;
    }
    setAiMode(id);
  };

  const startDownload = async (model) => {
    setConsentFor(null);
    try {
      await download(model.id);
    } catch (err) {
      toast.error(ERROR_LABEL[err?.code] || 'Der Download konnte nicht gestartet werden.');
    }
  };

  const confirmDelete = async (model) => {
    setDeleteFor(null);
    try {
      await remove(model.id);
      if (readyModel?.id === model.id && mode === 'device') setAiMode('auto');
      toast.success(`${model.label} wurde entfernt.`);
    } catch {
      toast.error('Das Modell konnte nicht entfernt werden.');
    }
  };

  const selectModel = (model) => {
    setPreferredModelId(model.id);
    setPreferred(model.id);
  };

  return (
    <section className="bb-app bb-card space-y-5" aria-labelledby="local-ai-title">
      <div>
        <p className="bb-eyebrow mb-2">Cloud oder Handy</p>
        <h2 id="local-ai-title" className="text-xl font-semibold">KI-Modus</h2>
        <p className="bb-muted mt-2">
          Dein Buddy kann auch direkt auf deinem Handy denken — offline und ohne dass deine Fragen an eine Cloud-KI gehen.
        </p>
      </div>

      {!native && (
        <p className="bb-muted">Die KI auf dem Gerät gibt es in der BaitBuddy-App für Android. Im Browser antwortet immer die Cloud-KI.</p>
      )}

      {native && loading && (
        <p className="bb-muted flex items-center gap-2"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Gerät wird geprüft …</p>
      )}

      {native && !loading && !supported && (
        <p className="bb-muted">{UNSUPPORTED_REASON[status?.reason] || 'Dein Gerät unterstützt die KI auf dem Gerät nicht.'}</p>
      )}

      {native && supported && (
        <>
          <div role="radiogroup" aria-label="KI-Modus" className="grid gap-3">
            {MODES.map(({ id, icon: Icon, title, text }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={mode === id}
                onClick={() => chooseMode(id)}
                className={`text-left rounded-2xl p-4 flex gap-3 items-start ${mode === id ? 'ring-2 ring-cyan-300 bg-cyan-400/10' : 'bg-white/5'}`}
              >
                <Icon size={20} className="mt-0.5 shrink-0 text-cyan-300" aria-hidden="true" />
                <span>
                  <span className="font-semibold flex items-center gap-2">{title}{mode === id && <Check size={16} className="text-cyan-300" aria-hidden="true" />}</span>
                  <span className="text-sm text-slate-300 block mt-1">{text}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold">Modell auf dem Gerät</h3>
            {status.models.map((model) => {
              const pct = model.sizeBytes ? Math.min(100, Math.round((model.downloadedBytes / model.sizeBytes) * 100)) : 0;
              const active = readyModel?.id === model.id;
              return (
                <div key={model.id} className="rounded-2xl bg-white/5 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold flex items-center gap-2">
                        {model.label}
                        {active && model.state === 'ready' && <span className="text-xs rounded-full bg-emerald-400/15 text-emerald-200 px-2 py-0.5">Aktiv</span>}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {formatBytes(model.sizeBytes)} · {STATE_LABEL[model.state] || model.state}
                        {!model.fitsDevice && ' · zu wenig Arbeitsspeicher'}
                      </p>
                      {model.error && (
                        <p className="text-xs text-red-300 mt-1">{ERROR_LABEL[model.error] || 'Der Download ist fehlgeschlagen.'}</p>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {(model.state === 'absent' || model.state === 'error' || model.state === 'paused') && model.fitsDevice && (
                        <button type="button" className="bb-secondary" onClick={() => setConsentFor(model)}>
                          <Download size={16} aria-hidden="true" />{model.state === 'paused' ? 'Fortsetzen' : 'Laden'}
                        </button>
                      )}
                      {model.state === 'downloading' && (
                        <button type="button" className="bb-secondary" onClick={() => cancelDownload(model.id)}>
                          <Pause size={16} aria-hidden="true" />Pausieren
                        </button>
                      )}
                      {model.state === 'ready' && !active && (
                        <button type="button" className="bb-secondary" onClick={() => selectModel(model)}>Verwenden</button>
                      )}
                      {(model.state === 'ready' || model.state === 'paused') && (
                        <button type="button" className="bb-secondary" aria-label={`${model.label} entfernen`} onClick={() => setDeleteFor(model)}>
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                  {(model.state === 'downloading' || model.state === 'verifying' || model.state === 'paused') && (
                    <div className="space-y-1">
                      <Progress value={pct} aria-label={`Download ${model.label}`} />
                      <p className="text-xs text-slate-400">
                        {model.state === 'verifying'
                          ? 'Datei wird auf Echtheit geprüft …'
                          : `${formatBytes(model.downloadedBytes)} von ${formatBytes(model.sizeBytes)} (${pct} %)`}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-slate-400">
              Freier Speicher: {formatBytes(status.freeStorageBytes)} · Arbeitsspeicher: {formatBytes(status.deviceRamBytes)}
            </p>
          </div>

          <div className="rounded-2xl bg-white/5 p-4 text-sm text-slate-300 space-y-2">
            <p className="flex gap-2"><ShieldCheck size={18} className="shrink-0 text-cyan-300" aria-hidden="true" />Auf dem Gerät werden Fragen und Antworten nur auf deinem Handy berechnet. Für Wetter, Fangbuch und Spots fragt der Buddy wie gewohnt die BaitBuddy-Dienste ab.</p>
            <p className="flex gap-2"><WifiOff size={18} className="shrink-0 text-cyan-300" aria-hidden="true" />Vorlesen und Spracherkennung laufen weiterhin über Online-Sprachdienste. Schalte den Lautsprecher aus und tippe, wenn gar nichts das Gerät verlassen soll.</p>
          </div>
        </>
      )}

      <AlertDialog open={!!consentFor} onOpenChange={(open) => !open && setConsentFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{consentFor?.label} herunterladen?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Das Modell ist {consentFor ? formatBytes(consentFor.sizeBytes) : ''} groß und wird im privaten Speicher von BaitBuddy abgelegt. Nur BaitBuddy kann es benutzen; du kannst es hier jederzeit wieder entfernen.</p>
                <p>Die Datei kommt von Hugging Face (offizielle Qwen3.5-Gewichte, Apache-2.0-Lizenz). Hugging Face sieht dabei deine IP-Adresse, aber keine BaitBuddy-Daten. Vor der Nutzung prüft die App die Datei per Prüfsumme.</p>
                {status?.metered && <p className="font-semibold">Du bist gerade im Mobilfunknetz. Für diese Datenmenge empfehlen wir WLAN.</p>}
                <p>Lass die App während des Downloads geöffnet. Wird er unterbrochen, geht es beim nächsten Mal an derselben Stelle weiter.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => consentFor && startDownload(consentFor)}>Herunterladen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteFor} onOpenChange={(open) => !open && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteFor?.label} entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              Das gibt {deleteFor ? formatBytes(deleteFor.sizeBytes) : ''} Speicher frei. Für die KI auf dem Gerät musst du es danach erneut herunterladen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Behalten</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteFor && confirmDelete(deleteFor)}>Entfernen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
