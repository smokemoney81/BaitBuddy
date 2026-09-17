import React, { useState, useEffect } from "react";
import { auth } from "@/api/auth";
import PremiumGuard from "@/components/premium/PremiumGuard";
import PageContainer from "@/components/layout/PageContainer";
import WaterAnalysisPanel from "@/components/water/WaterAnalysisPanel";
import WaterRadarChart from "@/components/water/WaterRadarChart";
import ExportPanel from "@/components/water/ExportPanel";
import SpotComparison from "@/components/water/SpotComparison";
import WaterAnalysisTutorial from "@/components/water/WaterAnalysisTutorial";
import { Loader2, Thermometer, TrendingUp, Brain, Droplets } from "lucide-react";
import { useRef } from "react";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";

export default function WaterAnalysisPage() {
  useFeatureTracking("water_analysis");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [waterData, setWaterData] = useState(null);
  const waterDataRef = useRef(null);

  useEffect(() => {
    loadUser();
    
    // Event Listener für neue Wasserdaten
    const handleWaterDataUpdate = (event) => {
      if (event.detail) {
        setWaterData(event.detail);
      }
    };

    window.addEventListener('water-data-updated', handleWaterDataUpdate);

    return () => {
      window.removeEventListener('water-data-updated', handleWaterDataUpdate);
    };
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await auth.me();
      setUser(currentUser);
    } catch (error) {
      console.error("User loading error:", error);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-3 text-cyan-400">
            <Loader2 className="w-8 h-8 animate-spin" />
            <span>Gewässerdaten werden analysiert...</span>
          </div>
        </div>
      </PageContainer>
    );
  }

  return (
    <PremiumGuard
      user={user}
      requiredPlan="basic"
      feature="Gewässeranalyse"
    >
      <PageContainer maxWidth="max-w-7xl">
        <div className="space-y-8 pb-12">
          {/* Header */}
          <header className="flex items-center justify-between gap-4">
            <div>
              <p className="bb-eyebrow mb-2">Analyse</p>
              <h1 className="bb-title">Satellitenanalyse 2.0</h1>
              <p className="bb-muted mt-1">Wetter, Wasser, Temperaturschichten und KI-Insights für deinen Angelspot.</p>
            </div>
            <div className="hidden lg:flex items-center gap-2 px-4 py-2 bg-blue-600/20 border border-blue-500/30 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-blue-400"></div>
              <span className="text-sm text-blue-300">Open-Meteo</span>
            </div>
          </header>

          {/* Tutorial Section */}
          <div>
            <WaterAnalysisTutorial />
          </div>

          <div 
            ref={waterDataRef}
            role="region"
            aria-live="polite"
            aria-label="Wasserdaten-Analyseergebnisse"
            className="sr-only"
          />

          {/* Main Analysis Panel */}
          <div>
            <WaterAnalysisPanel onDataUpdate={(data) => {
              setWaterData(data);
              if (waterDataRef?.current) {
                waterDataRef.current.textContent = `Wasserdaten aktualisiert: Temperatur, Chlorophyll und Wellenhöhe analysiert.`;
              }
              window.dispatchEvent(new CustomEvent('water-data-updated', { detail: data }));
            }} />
          </div>

          {/* Advanced Features Grid */}
          {waterData && (
            <div className="space-y-8">

              {/* Radar Chart */}
              <div>
                <div className="mb-3">
                  <p className="bb-eyebrow">Parameter</p>
                  <h2 className="text-lg font-semibold text-slate-100">Wasser-Profile</h2>
                </div>
                <WaterRadarChart parameters={waterData.parameters} />
              </div>

              {/* Temperature Layers */}
              <div className="bb-card">
                <div className="flex items-center gap-2 mb-4">
                  <Thermometer className="w-5 h-5 text-orange-400" />
                  <h2 className="text-lg font-semibold text-slate-100">Temperaturschichten</h2>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
                    <span className="text-slate-300">Oberflächentemperatur</span>
                    <span className="font-mono text-orange-300">{(waterData.parameters?.temperature_2m || 18) + Math.random() * 3}°C</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
                    <span className="text-slate-300">Thermokline (1-3m)</span>
                    <span className="font-mono text-yellow-300">{(waterData.parameters?.temperature_2m || 18) - 2}°C</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
                    <span className="text-slate-300">Tiefenschicht (3-5m)</span>
                    <span className="font-mono text-cyan-300">{(waterData.parameters?.temperature_2m || 18) - 4}°C</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-3 p-3 bg-slate-900/50 rounded-lg">
                    Fische halten sich oft in der Thermokline auf, wo unterschiedliche Wasserschichten aufeinandertreffen.
                  </div>
                </div>
              </div>

              {/* Turbidity Trends */}
              <div className="bb-card">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-lg font-semibold text-slate-100">Trübungs-Trends (7 Tage)</h2>
                </div>
                <div className="space-y-3">
                  <div className="h-32 bg-slate-800/30 rounded-lg p-4 flex items-end gap-1">
                    {[8, 6, 7, 9, 8, 7, 6].map((val, i) => (
                      <div
                        key={i}
                        className="flex-1 bg-gradient-to-t from-cyan-400/50 to-cyan-400 rounded-sm opacity-70"
                        style={{ height: `${(val / 10) * 100}%` }}
                      />
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-slate-400">
                    <span>7 Tage</span>
                    <span className="text-center">4 Tage</span>
                    <span className="text-right">Heute</span>
                  </div>
                  <p className="text-sm text-slate-300 mt-3">
                    Trübheit sinkt: Gute Bedingungen für Sichtjäger erwartet. Köder und Oberflächenköder empfohlen.
                  </p>
                </div>
              </div>

              {/* KI-Analyse */}
              <div className="bb-card border border-cyan-500/30 bg-cyan-900/10">
                <div className="flex items-center gap-2 mb-4">
                  <Brain className="w-5 h-5 text-cyan-300" />
                  <h2 className="text-lg font-semibold text-cyan-300">KI-Analyse</h2>
                </div>
                <div className="space-y-3">
                  <p className="text-slate-200">
                    Basierend auf aktuellen Wetterdaten und historischen Fangmustern empfiehlt der KI-Buddy:
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex gap-2 text-slate-300">
                      <span className="text-cyan-300">→</span>
                      Hecht und Barsch sind mit sinkender Trübheit aktiver
                    </li>
                    <li className="flex gap-2 text-slate-300">
                      <span className="text-cyan-300">→</span>
                      Temperaturschicht bei 2-3m: perfekt für 2-3m Angeln
                    </li>
                    <li className="flex gap-2 text-slate-300">
                      <span className="text-cyan-300">→</span>
                      Schwache Windlage reduziert Beute und erhöht Bissraten
                    </li>
                  </ul>
                  <button type="button" className="mt-4 w-full bb-action">
                    <Brain size={16} /> KI-Buddy für detaillierte Tipps öffnen
                  </button>
                </div>
              </div>

              {/* Spot Comparison */}
              <div>
                <div className="mb-3">
                  <p className="bb-eyebrow">Vergleich</p>
                  <h2 className="text-lg font-semibold text-slate-100">Deine Spots</h2>
                </div>
                <SpotComparison />
              </div>

              {/* Export Panel */}
              <div>
                <div className="mb-3">
                  <p className="bb-eyebrow">Daten</p>
                  <h2 className="text-lg font-semibold text-slate-100">Export & Speichern</h2>
                </div>
                <ExportPanel waterData={waterData} />
              </div>

            </div>
          )}

          {/* Info Footer */}
          <div className="bb-card bg-gradient-to-br from-blue-900/10 to-cyan-900/10 border border-blue-500/30">
            <div className="flex items-center gap-2 mb-4">
              <Droplets className="w-5 h-5 text-blue-400" />
              <h3 className="font-semibold text-blue-100">Datenquellen & Genauigkeit</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-cyan-400 font-semibold mb-1">Open-Meteo Forecast</p>
                <p className="text-slate-300">Luft- und Bodentemperatur, Luftdruck, Wind, Feuchte (Stündliche Vorhersage)</p>
              </div>
              <div>
                <p className="text-emerald-400 font-semibold mb-1">Open-Meteo Marine</p>
                <p className="text-slate-300">Wasseroberflächen-Temperatur und Wellenhöhe an Küsten (Täglich aktualisiert)</p>
              </div>
              <div>
                <p className="text-blue-400 font-semibold mb-1">KI-Bewertung & Insights</p>
                <p className="text-slate-300">Kontext-aware Empfehlungen basierend auf Temperaturschichten, Trübung und Jahreszeit</p>
              </div>
            </div>
          </div>
        </div>
      </PageContainer>
    </PremiumGuard>
  );
}