import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Droplets, Loader2, AlertCircle } from 'lucide-react';
import { api } from '@/api/frontendClient';
import { buildWaterAnalysis } from '@/lib/waterAnalysis';

// Gewaesser-Overlay fuer die Karte.
// ============================================================================
// Diese Komponente lieferte zuvor vier fest verdrahtete Rueckgabewerte
// (pH 7.2, Sauerstoff 8.5 mg/L, 18.5 °C, 0.5 m/s, 12/45 m Tiefe) und zeigte sie
// als Messwerte des betrachteten Kartenausschnitts an — unabhaengig davon,
// welches Gewaesser dort lag. Zusaetzlich riefen die Render-Funktionen
// `L.heatLayer` auf, das es ohne das Plugin `leaflet.heat` gar nicht gibt
// (nicht in package.json); der TypeError wurde vom umgebenden try/catch
// verschluckt, weshalb ausser dem erfundenen Panel nie etwas erschien.
//
// Jetzt gilt dieselbe Regel wie in src/lib/waterAnalysis.js: Angezeigt wird
// ausschliesslich, was POST /api/water-data/fetch (Open-Meteo Forecast +
// Marine) real gemessen zurueckliefert. pH, Sauerstoff, Stroemung und
// Tiefenlinien sind ersatzlos entfallen — dafuer existiert keine Datenquelle.

// Der Endpunkt schreibt pro Aufruf eine Zeile in `water_scenes`. Deshalb wird
// nur bei echtem Ortswechsel neu geladen: 2 Nachkommastellen entsprechen rund
// 1 km, feiner aufzuloesen wuerde beim Kartenschieben nur die Tabelle fluten.
function locationKey(lat, lon) {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

function HydrographicAnalysis({ visible = false, bounds = null }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const lastKeyRef = useRef(null);
  const abortRef = useRef(null);

  const loadWaterData = useCallback(async (lat, lon) => {
    const key = locationKey(lat, lon);
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setErrorMsg(null);
    try {
      // `low` = 4 Messpunkte: Das Overlay ist ein Blick-Panel, die volle
      // Zeitreihe liefert die Seite Gewaesseranalyse.
      const scene = await api.post(
        '/api/water-data/fetch',
        { latitude: lat, longitude: lon, quality: 'low' },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;

      const result = buildWaterAnalysis(scene, { lat, lon, name: 'Kartenausschnitt' });
      if (Object.keys(result.parameters).length === 0) {
        setAnalysis(null);
        setErrorMsg('Für diesen Ausschnitt liegen keine Messwerte vor');
        return;
      }
      setAnalysis(result);
    } catch (error) {
      if (controller.signal.aborted) return;
      // Erneuter Versuch soll moeglich sein, wenn der Nutzer zurueckkehrt.
      lastKeyRef.current = null;
      setAnalysis(null);
      setErrorMsg(error?.message || 'Gewässerdaten nicht verfügbar');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible || !bounds) return;
    const center = typeof bounds.getCenter === 'function' ? bounds.getCenter() : null;
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;
    loadWaterData(center.lat, center.lng);
  }, [visible, bounds, loadWaterData]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Wichtig: nichts rendern, wenn ausgeblendet. Vorher lag der Panel-Container
  // dauerhaft im DOM und fing in der oberen rechten Kartenecke Klicks ab.
  if (!visible) return null;

  return (
    <div className="absolute top-4 right-4 z-30 bg-gray-900/80 backdrop-blur-sm rounded-lg border border-gray-700 p-3 text-xs max-w-xs">
      <div className="flex items-center gap-2 text-cyan-400 font-semibold">
        <Droplets className="w-4 h-4" />
        <span>Gewässerdaten</span>
        {loading && <Loader2 className="w-3 h-3 animate-spin" />}
      </div>

      {errorMsg && (
        <div className="mt-2 flex items-start gap-2 text-amber-400">
          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {analysis && (
        <div className="mt-2 space-y-1">
          {Object.entries(analysis.parameters).map(([key, param]) => (
            <div key={key} className="flex justify-between gap-3">
              <span className="text-gray-400">{param.label}:</span>
              <span className="text-white">
                {param.value.toFixed(1)} {param.unit}
              </span>
            </div>
          ))}

          {analysis.assessment.score !== null && (
            <div className="border-t border-gray-700 pt-2 mt-2 flex justify-between gap-3">
              <span className="text-gray-400">Bedingungen:</span>
              <span
                className={
                  analysis.assessment.score >= 80
                    ? 'text-green-400 font-semibold'
                    : analysis.assessment.score >= 55
                    ? 'text-yellow-400 font-semibold'
                    : 'text-red-400 font-semibold'
                }
              >
                {analysis.assessment.score}/100 · {analysis.assessment.rating}
              </span>
            </div>
          )}

          <div className="text-[10px] text-gray-500 pt-1">Quelle: {analysis.source}</div>
        </div>
      )}

      {!analysis && !errorMsg && !loading && (
        <div className="mt-2 text-gray-400">Kartenausschnitt wird ausgewertet…</div>
      )}
    </div>
  );
}

export default HydrographicAnalysis;
