
import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Gear, Spot } from "@/entities/all";
import { InvokeLLM } from "@/integrations/Core";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import {
  Play,
  MapPin,
  Fish,
  Package,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Target,
  Clock,
  Thermometer,
  Lightbulb
} from "lucide-react";
import { motion } from "framer-motion";
import PageTitle from "@/components/layout/PageTitle";

export default function StartFishing() {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedSpot, setSelectedSpot] = useState("");
  const [targetFish, setTargetFish] = useState("");
  const [sessionDuration, setSessionDuration] = useState("");
  const [spots, setSpots] = useState([]);
  const [gear, setGear] = useState([]);
  const [gearCheck, setGearCheck] = useState({});
  const [recommendations, setRecommendations] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);

  const steps = [
    { title: "Angelplatz", icon: MapPin, description: "Wähle deinen Spot" },
    { title: "Zielfisch", icon: Fish, description: "Was möchtest du fangen?" },
    { title: "Ausrüstung", icon: Package, description: "Prüfe deine Ausrüstung" },
    { title: "Los geht's", icon: Play, description: "Session starten" }
  ];

  const fishSpecies = [
    "Hecht", "Zander", "Barsch", "Karpfen", "Schleie",
    "Forelle", "Äsche", "Wels", "Brassen", "Rotauge"
  ];

  const sessionDurations = [
    { value: "2", label: "Kurze Session (2h)" },
    { value: "4", label: "Halber Tag (4h)" },
    { value: "8", label: "Ganzer Tag (8h)" },
    { value: "24", label: "Übernachtung (24h)" }
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [spotsData, gearData] = await Promise.all([
        Spot.list(),
        Gear.list()
      ]);
      setSpots(spotsData);
      setGear(gearData);
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const performGearCheck = useCallback(async () => {
    if (!selectedSpot || !targetFish) return;

    setIsAnalyzing(true);

    const selectedSpotData = spots.find(s => s.id === selectedSpot);
    const gearList = gear.map(g => `${g.name} (${g.type}): ${g.specifications || 'keine Details'}`).join(', ');

    try {
      const prompt = `Analysiere die Angelausrüstung für diese Situation:

Angelplatz: ${selectedSpotData?.name} (${selectedSpotData?.water_type})
Zielfisch: ${targetFish}
Verfügbare Ausrüstung: ${gearList}

Bewerte jedes Ausrüstungsteil mit:
- "ideal" - perfekt geeignet
- "geeignet" - funktioniert gut
- "bedingt" - nicht optimal aber verwendbar
- "ungeeignet" - nicht empfohlen

Gib auch 3-5 konkrete Handlungstipps für diese spezifische Situation.

Antwort im JSON-Format:
{
  "gear_ratings": {
    "gear_id": "bewertung"
  },
  "tips": ["tipp1", "tipp2", "tipp3"],
  "weather_advice": "wetterabhängiger ratschlag",
  "best_time": "beste tageszeit"
}`;

      const response = await InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            gear_ratings: { type: "object" },
            tips: { type: "array", items: { type: "string" } },
            weather_advice: { type: "string" },
            best_time: { type: "string" }
          }
        }
      });

      setRecommendations(response);

      // Map gear ratings
      const gearCheckResults = {};
      gear.forEach(item => {
        const rating = response.gear_ratings?.[item.id] || "geeignet";
        gearCheckResults[item.id] = {
          rating,
          suitable: ["ideal", "geeignet"].includes(rating)
        };
      });
      setGearCheck(gearCheckResults);

    } catch (error) {
      console.error("Error analyzing gear:", error);
      // Fallback gear check
      const fallbackCheck = {};
      gear.forEach(item => {
        fallbackCheck[item.id] = {
          rating: "geeignet",
          suitable: true
        };
      });
      setGearCheck(fallbackCheck);
    }

    setIsAnalyzing(false);
  }, [selectedSpot, targetFish, spots, gear]);

  useEffect(() => {
    if (currentStep === 2 && selectedSpot && targetFish) {
      performGearCheck();
    }
  }, [currentStep, selectedSpot, targetFish, performGearCheck]);

  const getRatingColor = (rating) => {
    switch (rating) {
      case "ideal": return "text-green-400";
      case "geeignet": return "text-emerald-400";
      case "bedingt": return "text-yellow-400";
      case "ungeeignet": return "text-red-400";
      default: return "text-gray-400";
    }
  };

  const getRatingIcon = (rating) => {
    switch (rating) {
      case "ideal":
      case "geeignet":
        return <CheckCircle2 size={16} style={{ color: '#4ade80' }} />;
      case "bedingt":
        return <AlertTriangle size={16} style={{ color: '#facc15' }} />;
      case "ungeeignet":
        return <XCircle size={16} style={{ color: '#f87171' }} />;
      default:
        return <CheckCircle2 size={16} style={{ color: 'var(--bb-muted)' }} />;
    }
  };

  const startSession = async () => {
    setSessionStarted(true);
    // Here you could create a fishing session record
    setTimeout(() => {
      toast.success("Angel-Session gestartet! Viel Erfolg am Wasser!");
    }, 1000);
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: return selectedSpot;
      case 1: return targetFish;
      case 2: return Object.keys(gearCheck).length > 0;
      default: return true;
    }
  };

  if (sessionStarted) {
    return (
      <div className="bb-page">
        <div className="max-w-2xl mx-auto">
          <div className="bb-card text-center">
            <div className="p-12">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <div className="w-20 h-20 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Fish size={40} className="text-white" />
                </div>
              </motion.div>
              <h1 className="text-3xl font-bold text-white mb-4">Session gestartet!</h1>
              <p className="mb-6" style={{ color: '#d1d5db' }}>
                Deine Angel-Session für {targetFish} ist aktiv.
                Vergiss nicht, deine Fänge im Fangbuch zu dokumentieren!
              </p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 rounded-lg" style={{ background: 'var(--bb-surface)' }}>
                  <strong style={{ color: '#34d399' }}>Spot:</strong>
                  <p>{spots.find(s => s.id === selectedSpot)?.name}</p>
                </div>
                <div className="p-3 rounded-lg" style={{ background: 'var(--bb-surface)' }}>
                  <strong style={{ color: '#60a5fa' }}>Zielfisch:</strong>
                  <p>{targetFish}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bb-page">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <PageTitle className="mb-6" title="Angel-Session starten" subtitle="Bereite deine Angel-Session optimal vor." />

        {/* Progress */}
        <div className="bb-card mb-8">
          <div className="grid gap-4">
            <div className="flex justify-between items-center mb-4">
              {steps.map((step, index) => (
                <div key={index} className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                    index <= currentStep
                      ? 'bg-emerald-600'
                      : ''
                  }`} style={index > currentStep ? { background: 'var(--bb-surface)' } : {}}>
                    <step.icon size={20} className="text-white" />
                  </div>
                  <div className="text-center">
                    <div className={`font-medium ${
                      index <= currentStep ? 'text-white' : ''
                    }`} style={index > currentStep ? { color: 'var(--bb-muted)' } : {}}>
                      {step.title}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--bb-muted)' }}>{step.description}</div>
                  </div>
                </div>
              ))}
            </div>
            <Progress value={(currentStep / (steps.length - 1)) * 100} className="h-2" />
          </div>
        </div>

        {/* Step Content */}
        <div className="space-y-6">
          {/* Step 0: Select Spot */}
          {currentStep === 0 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="bb-card">
                <div className="bb-form-title flex items-center gap-2" style={{ color: 'white' }}>
                  <MapPin size={20} />
                  Angelplatz auswählen
                </div>
                <div className="grid gap-4 mt-4">
                  <Select value={selectedSpot} onValueChange={setSelectedSpot}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wähle einen Angelplatz..." />
                    </SelectTrigger>
                    <SelectContent>
                      {spots.map((spot) => (
                        <SelectItem key={spot.id} value={spot.id}>
                          <div className="flex justify-between items-center w-full">
                            <span>{spot.name}</span>
                            <span className="bb-pill-info ml-2" style={{ background: 'transparent', border: '1px solid var(--bb-border)', color: 'var(--bb-muted)', fontSize: '0.75rem' }}>
                              {spot.water_type}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedSpot && (
                    <div className="p-4 rounded-lg" style={{ background: 'rgba(0,0,0,.25)' }}>
                      <h4 className="font-semibold text-white mb-2">Spot Details:</h4>
                      <div className="text-sm" style={{ color: '#d1d5db' }}>
                        {spots.find(s => s.id === selectedSpot)?.notes || "Keine weiteren Informationen"}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 1: Select Target Fish */}
          {currentStep === 1 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="bb-card">
                <div className="bb-form-title flex items-center gap-2" style={{ color: 'white' }}>
                  <Fish size={20} />
                  Zielfisch wählen
                </div>
                <div className="grid gap-4 mt-4">
                  <Select value={targetFish} onValueChange={setTargetFish}>
                    <SelectTrigger>
                      <SelectValue placeholder="Welchen Fisch möchtest du fangen?" />
                    </SelectTrigger>
                    <SelectContent>
                      {fishSpecies.map((fish) => (
                        <SelectItem key={fish} value={fish}>
                          {fish}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div>
                    <label className="text-sm mb-2 block" style={{ color: 'var(--bb-muted)' }}>Session-Dauer</label>
                    <Select value={sessionDuration} onValueChange={setSessionDuration}>
                      <SelectTrigger>
                        <SelectValue placeholder="Wie lange möchtest du angeln?" />
                      </SelectTrigger>
                      <SelectContent>
                        {sessionDurations.map((duration) => (
                          <SelectItem key={duration.value} value={duration.value}>
                            {duration.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 2: Gear Check */}
          {currentStep === 2 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="bb-card">
                <div className="bb-form-title flex items-center gap-2" style={{ color: 'white' }}>
                  <Package size={20} />
                  Ausrüstungs-Check
                  {isAnalyzing && <Loader2 size={16} className="animate-spin ml-2" />}
                </div>
                <div className="grid gap-4 mt-4">
                  {isAnalyzing ? (
                    <div className="text-center py-8">
                      <Loader2 size={32} className="animate-spin mx-auto mb-4" style={{ color: '#34d399' }} />
                      <p style={{ color: '#d1d5db' }}>KI analysiert deine Ausrüstung...</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {gear.map((item) => {
                        const check = gearCheck[item.id];
                        return (
                          <div key={item.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'rgba(0,0,0,.25)' }}>
                            <div className="flex items-center gap-3">
                              {getRatingIcon(check?.rating)}
                              <div>
                                <div className="font-medium text-white">{item.name}</div>
                                <div className="text-sm" style={{ color: 'var(--bb-muted)' }}>{item.type}</div>
                              </div>
                            </div>
                            <span
                              className={`bb-pill-info ${getRatingColor(check?.rating)}`}
                              style={{ background: 'transparent', border: '1px solid var(--bb-border)', fontSize: '0.75rem' }}
                            >
                              {check?.rating || 'Wird analysiert...'}
                            </span>
                          </div>
                        );
                      })}

                      {recommendations && (
                        <div className="mt-6 space-y-4">
                          {/* AI Tips */}
                          <Alert className="border-emerald-500 bg-emerald-500/10">
                            <Lightbulb size={16} />
                            <AlertDescription className="text-emerald-200">
                              <strong>KI-Tipps für deine Session:</strong>
                              <ul className="mt-2 space-y-1 text-sm">
                                {recommendations.tips?.map((tip, index) => (
                                  <li key={index}>• {tip}</li>
                                ))}
                              </ul>
                            </AlertDescription>
                          </Alert>

                          {/* Weather & Time advice */}
                          <div className="grid md:grid-cols-2 gap-4">
                            {recommendations.weather_advice && (
                              <div className="p-3 rounded-lg" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
                                <div className="flex items-center gap-2 mb-1" style={{ color: '#60a5fa' }}>
                                  <Thermometer size={16} />
                                  <strong>Wetter-Tipp:</strong>
                                </div>
                                <p className="text-sm" style={{ color: '#93c5fd' }}>{recommendations.weather_advice}</p>
                              </div>
                            )}
                            {recommendations.best_time && (
                              <div className="p-3 rounded-lg" style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}>
                                <div className="flex items-center gap-2 mb-1" style={{ color: '#c084fc' }}>
                                  <Clock size={16} />
                                  <strong>Beste Zeit:</strong>
                                </div>
                                <p className="text-sm" style={{ color: '#d8b4fe' }}>{recommendations.best_time}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 3: Ready to Start */}
          {currentStep === 3 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="bb-card">
                <div className="bb-form-title flex items-center gap-2" style={{ color: 'white' }}>
                  <Target size={20} />
                  Bereit zum Angeln!
                </div>
                <div className="grid gap-4 mt-4">
                  <div className="space-y-6">
                    <div className="text-center">
                      <h3 className="text-xl font-semibold text-white mb-4">
                        Session-Zusammenfassung
                      </h3>
                      <div className="grid md:grid-cols-3 gap-4 mb-6">
                        <div className="p-4 rounded-lg" style={{ background: 'rgba(0,0,0,.25)' }}>
                          <MapPin size={24} className="mx-auto mb-2" style={{ color: '#60a5fa' }} />
                          <div className="font-medium text-white">Spot</div>
                          <div className="text-sm" style={{ color: '#d1d5db' }}>
                            {spots.find(s => s.id === selectedSpot)?.name}
                          </div>
                        </div>
                        <div className="p-4 rounded-lg" style={{ background: 'rgba(0,0,0,.25)' }}>
                          <Fish size={24} className="mx-auto mb-2" style={{ color: '#4ade80' }} />
                          <div className="font-medium text-white">Zielfisch</div>
                          <div className="text-sm" style={{ color: '#d1d5db' }}>{targetFish}</div>
                        </div>
                        <div className="p-4 rounded-lg" style={{ background: 'rgba(0,0,0,.25)' }}>
                          <Clock size={24} className="mx-auto mb-2" style={{ color: '#c084fc' }} />
                          <div className="font-medium text-white">Dauer</div>
                          <div className="text-sm" style={{ color: '#d1d5db' }}>
                            {sessionDurations.find(d => d.value === sessionDuration)?.label || "Nicht gesetzt"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={startSession}
                      className="bb-action w-full text-lg py-3"
                      style={{ background: '#059669' }}
                    >
                      <Play size={20} className="mr-2" />
                      Angel-Session starten
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="bb-secondary"
          >
            Zurück
          </button>
          <button
            onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
            disabled={!canProceed() || currentStep === steps.length - 1}
            className="bb-action"
            style={{ background: '#059669' }}
          >
            Weiter
          </button>
        </div>
      </div>
    </div>
  );
}
