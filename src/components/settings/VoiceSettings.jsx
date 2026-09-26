import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { auth } from "@/api/auth";
import { Volume2, VolumeX, Lock, Crown, Play } from "lucide-react";
import { toast } from "sonner";
import { useOptimisticMutation } from "@/lib/useOptimisticMutation";
import { usePlan } from "@/components/premium/PlanContext";
import { getPlanLevel } from "@/components/premium/planHierarchy";
import { getPreferredTtsVoice, setPreferredTtsVoice } from "@/lib/ttsVoice";
import { speakWithFallback } from "@/components/utils/elevenLabsTTS";

// Auswählbare KI-Buddy-Stimmen. Die weibliche Stimme ist ein Ultimate-Feature;
// das verbindliche Gate sitzt serverseitig in POST /api/ai/tts — die Sperre
// hier ist die passende UI dazu.
const VOICES = [
  { id: 'male', name: 'Daniel', description: 'Männliche Standardstimme — natürlich und klar', requiresUltimate: false },
  { id: 'female', name: 'Matilda', description: 'Weibliche Stimme — warm und freundlich', requiresUltimate: true },
];

const VOICE_SAMPLE_TEXT = 'Hallo, ich bin dein KI-Buddy. Petri Heil und ab ans Wasser!';

export default function VoiceSettings() {
  const navigate = useNavigate();
  const { planLevel, loading: planLoading } = usePlan();
  const hasUltimate = planLevel >= getPlanLevel('elite');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [speechSpeed, setSpeechSpeed] = useState(1.0);
  const [initialState, setInitialState] = useState({ audioEnabled: true, speechSpeed: 1.0 });
  const [selectedVoice, setSelectedVoice] = useState(() => getPreferredTtsVoice());
  const [isSampling, setIsSampling] = useState(false);

  // Fällt der Plan weg (z.B. Ultimate abgelaufen), Auswahl auf Standard
  // zurücksetzen — das Backend würde ohnehin auf die Standardstimme wechseln,
  // die Anzeige soll dann nicht Gegenteiliges behaupten. WICHTIG: Solange der
  // Plan noch lädt, ist planLevel vorübergehend 'free' — in dieser Phase darf
  // die gespeicherte weibliche Stimme eines Ultimate-Nutzers NICHT gelöscht
  // werden, sonst verliert er seine Auswahl bei jedem Öffnen der Seite.
  useEffect(() => {
    if (planLoading) return;
    if (!hasUltimate && selectedVoice === 'female') {
      setSelectedVoice('male');
      setPreferredTtsVoice('male');
    }
  }, [planLoading, hasUltimate, selectedVoice]);

  // Während der Plan lädt, nicht sperren — das verbindliche Gate sitzt
  // serverseitig; nach dem Laden korrigiert der Effekt oben die Auswahl.
  const selectVoice = (voice) => {
    if (voice.requiresUltimate && !hasUltimate && !planLoading) {
      toast.error('Die weibliche Stimme gibt es nur mit dem Ultimate-Plan.');
      return;
    }
    setSelectedVoice(voice.id);
    setPreferredTtsVoice(voice.id);
    toast.success(`Stimme "${voice.name}" ausgewählt`);
  };

  const playSample = async () => {
    if (isSampling) return;
    setIsSampling(true);
    try {
      await speakWithFallback(VOICE_SAMPLE_TEXT, { voiceEnabled: true, lang: 'de-DE', rate: speechSpeed });
    } catch {
      toast.error('Probehören fehlgeschlagen — bitte später erneut versuchen.');
    } finally {
      setIsSampling(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const user = await auth.me();
      const settings = user?.settings || {};
      
      const state = {
        audioEnabled: settings.audio_enabled !== false,
        speechSpeed: settings.speech_speed || 1.0
      };
      setAudioEnabled(state.audioEnabled);
      setSpeechSpeed(state.speechSpeed);
      setInitialState(state);
    } catch (error) {
      console.error("Fehler beim Laden der Einstellungen:", error);
    }
  };

  const voiceSettingsMutation = useOptimisticMutation({
    queryKey: 'userSettings',
    mutationFn: async (settings) => {
      const user = await auth.me();
      await auth.updateMe({
        settings: {
          ...user.settings,
          audio_enabled: settings.audioEnabled,
          speech_speed: settings.speechSpeed
        }
      });
      window.dispatchEvent(new CustomEvent('voiceSettingsUpdated'));
      return settings;
    },
    optimisticUpdate: () => ({ audioEnabled, speechSpeed }),
    onSuccess: () => {
      setInitialState({ audioEnabled, speechSpeed });
      toast.success("Audio-Einstellungen gespeichert!");
    },
    onError: (error) => {
      console.error("Fehler beim Speichern:", error);
      toast.error("Fehler beim Speichern der Einstellungen");
    },
    invalidateOnSettle: true
  });

  const saveSettings = () => {
    voiceSettingsMutation.mutate({ audioEnabled, speechSpeed });
  };

  const hasChanges = audioEnabled !== initialState.audioEnabled || speechSpeed !== initialState.speechSpeed;

  return (
    <Card className="glass-morphism border-gray-800">
      <CardHeader>
        <CardTitle className="text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.7)] flex items-center gap-2">
          {audioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          Audio-Einstellungen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Audio aktivieren/deaktivieren */}
        <div className="flex items-center justify-between">
          <Label htmlFor="audio-enabled" className="text-gray-300">
            Sprachausgabe aktivieren
          </Label>
          <Switch
            id="audio-enabled"
            checked={audioEnabled}
            onCheckedChange={setAudioEnabled}
          />
        </div>

        {/* Sprechgeschwindigkeit */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label className="text-gray-300">Sprechgeschwindigkeit</Label>
            <span className="text-sm text-cyan-400">{speechSpeed.toFixed(1)}x</span>
          </div>
          <Slider
            value={[speechSpeed]}
            onValueChange={(value) => setSpeechSpeed(value[0])}
            min={0.5}
            max={2.0}
            step={0.1}
            disabled={!audioEnabled}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>0.5x (Langsam)</span>
            <span>2.0x (Schnell)</span>
          </div>
        </div>

        {/* KI-Buddy-Stimme */}
        <div className="space-y-2">
          <Label className="text-gray-300">KI-Buddy-Stimme</Label>
          <div className="space-y-2" role="radiogroup" aria-label="KI-Buddy-Stimme auswählen">
            {VOICES.map((voice) => {
              const locked = voice.requiresUltimate && !hasUltimate && !planLoading;
              const active = selectedVoice === voice.id;
              return (
                <button
                  key={voice.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={`Stimme ${voice.name}${locked ? ' (nur mit Ultimate-Plan)' : ''}`}
                  onClick={() => selectVoice(voice)}
                  disabled={!audioEnabled}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-colors disabled:opacity-50 ${
                    active
                      ? 'border-cyan-400 bg-cyan-950/40'
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-500'
                  }`}
                >
                  <div>
                    <p className={`text-sm font-semibold ${active ? 'text-cyan-300' : 'text-gray-200'}`}>
                      {voice.name}
                    </p>
                    <p className="text-xs text-gray-400">{voice.description}</p>
                  </div>
                  {voice.requiresUltimate && (
                    <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                      locked ? 'bg-gray-700 text-gray-300' : 'bg-amber-500/20 text-amber-300'
                    }`}>
                      {locked ? <Lock className="w-3 h-3" /> : <Crown className="w-3 h-3" />}
                      Ultimate
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {!hasUltimate && (
            <div className="flex items-center justify-between gap-2 text-xs text-gray-400 bg-gray-800/50 p-3 rounded-lg">
              <span>
                Dein Plan spricht mit der schnellen Gerätestimme. Die natürlichen
                Premium-Stimmen (Daniel und Matilda) sind im Ultimate-Plan enthalten.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => navigate('/PremiumPlans')}
                className="border-amber-400/50 text-amber-300 hover:bg-amber-500/10 flex-shrink-0"
                aria-label="Ultimate-Plan ansehen"
              >
                <Crown className="w-3 h-3 mr-1" />
                Ultimate ansehen
              </Button>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={playSample}
            disabled={!audioEnabled || isSampling}
            className="w-full border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
            aria-label="Ausgewählte Stimme probehören"
          >
            <Play className="w-4 h-4 mr-2" />
            {isSampling ? 'Spielt ab...' : 'Stimme probehören'}
          </Button>
        </div>

        {/* Hinweis */}
        <div className="text-xs text-gray-500 bg-gray-800/50 p-3 rounded-lg">
          Tipp: Die Sprechgeschwindigkeit beeinflusst, wie schnell der KI-Buddy antwortet. Die Stimmen-Auswahl gilt sofort für alle Sprachausgaben des KI-Buddys.
        </div>

        {/* Speichern Button */}
        <Button 
          onClick={saveSettings}
          disabled={voiceSettingsMutation.isPending || !hasChanges}
          className="w-full bg-cyan-600 active:scale-95 active:bg-cyan-700 focus:ring-2 focus:ring-cyan-400"
          aria-label="Einstellungen speichern"
        >
          {voiceSettingsMutation.isPending ? 'Speichere...' : 'Einstellungen speichern'}
        </Button>
      </CardContent>
    </Card>
  );
}
