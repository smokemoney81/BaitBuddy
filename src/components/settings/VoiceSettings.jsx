import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { auth } from "@/api/auth";
import { Volume2, VolumeX, Crown, Play } from "lucide-react";
import { toast } from "sonner";
import { useOptimisticMutation } from "@/lib/useOptimisticMutation";
import { usePlan } from "@/components/premium/PlanContext";
import { getPlanLevel } from "@/components/premium/planHierarchy";
import { speakWithFallback } from "@/components/utils/elevenLabsTTS";
import { isVoiceGuideEnabled, setVoiceGuideEnabled } from "@/lib/voicePageGuide";

const VOICE_SAMPLE_TEXT = 'Hallo, ich bin dein KI-Buddy. Petri Heil und ab ans Wasser!';

export default function VoiceSettings() {
  const navigate = useNavigate();
  const { planLevel, loading: planLoading } = usePlan();
  const hasPremiumVoice = planLevel >= getPlanLevel('pro');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [speechSpeed, setSpeechSpeed] = useState(1.0);
  const [initialState, setInitialState] = useState({ audioEnabled: true, speechSpeed: 1.0 });
  const [isSampling, setIsSampling] = useState(false);
  const [voiceGuide, setVoiceGuide] = useState(() => isVoiceGuideEnabled());

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

        {/* Buddy spricht von sich aus (Seiten-Einleitung, offene Aufgaben) */}
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="voice-guide" className="text-gray-300">
            Sprach-Hinweise
            <span className="block text-xs text-gray-500 font-normal">
              Der Buddy erklärt neue Seiten und erinnert an offene Aufgaben.
            </span>
          </Label>
          <Switch
            id="voice-guide"
            checked={voiceGuide}
            onCheckedChange={(v) => { setVoiceGuide(v); setVoiceGuideEnabled(v); }}
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

        {/* KI-Buddy-Stimme — eine feste, weibliche Stimme für alle; nur die
            Technik (Gerät vs. Premium-Server) richtet sich nach dem Tarif. */}
        <div className="space-y-2">
          <Label className="text-gray-300">KI-Buddy-Stimme</Label>
          <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-700 bg-gray-800/50">
            <div>
              <p className="text-sm font-semibold text-gray-200">
                {hasPremiumVoice ? 'Premium-Stimme' : 'Schnelle Gerätestimme'}
              </p>
              <p className="text-xs text-gray-400">
                {hasPremiumVoice
                  ? 'Natürliche Server-Stimme, im Pro- und Ultimate-Plan enthalten.'
                  : 'Spricht direkt auf deinem Gerät — ohne Netz und ohne KI-Volumen.'}
              </p>
            </div>
            {hasPremiumVoice && (
              <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-amber-500/20 text-amber-300">
                <Crown className="w-3 h-3" />
                Pro
              </span>
            )}
          </div>

          {!hasPremiumVoice && !planLoading && (
            <div className="flex items-center justify-between gap-2 text-xs text-gray-400 bg-gray-800/50 p-3 rounded-lg">
              <span>
                Dein Plan spricht mit der schnellen Gerätestimme. Die natürliche
                Premium-Stimme ist ab dem Pro-Plan enthalten.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => navigate('/PremiumPlans')}
                className="border-amber-400/50 text-amber-300 hover:bg-amber-500/10 flex-shrink-0"
                aria-label="Pro-Plan ansehen"
              >
                <Crown className="w-3 h-3 mr-1" />
                Pro ansehen
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
          Tipp: Die Sprechgeschwindigkeit beeinflusst, wie schnell der KI-Buddy antwortet und gilt sofort für alle Sprachausgaben des KI-Buddys.
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
