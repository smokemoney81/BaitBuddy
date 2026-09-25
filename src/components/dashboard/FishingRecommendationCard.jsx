import React, { useState } from "react";
import { getFishingRecommendation } from "@/functions/getFishingRecommendation";
import { toast } from "sonner";
import SpeakButton from "@/components/ai/SpeakButton";
import { useLocation as useGeoLocation } from "@/components/location/LocationManager";

export default function FishingRecommendationCard() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const { ensureLocation } = useGeoLocation();

  const ratingColor = {
    "Gut": "text-emerald-700",
    "Mittel": "text-amber-700",
    "Schlecht": "text-red-700"
  };

  const analyze = async () => {
    setLoading(true);
    try {
      // Holt bei fehlendem gespeichertem Standort einmal GPS; bei Ablehnung
      // meldet requestGpsLocation den Grund bereits selbst.
      const loc = await ensureLocation();
      if (loc?.lat == null || loc?.lon == null) return;

      const res = await getFishingRecommendation({ latitude: loc.lat, longitude: loc.lon });
      if (res?.data?.recommendation) {
        setData(res.data);
        toast.success("Empfehlung aktualisiert");
      } else {
        toast.error("Keine Empfehlung erhalten");
      }
    } catch (e) {
      console.error(e);
      toast.error(e?.status === 401
        ? "Bitte melde dich an, um die Empfehlung zu nutzen."
        : e?.status === 429
          ? "Tageslimit erreicht. Bitte spaeter erneut versuchen."
          : "Fehler bei der Analyse. Bitte spaeter erneut versuchen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900/80 to-gray-900/40 border border-gray-800/50 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-cyan-400/70 uppercase tracking-wider">KI Angelempfehlung</h3>
          <p className="text-xs text-gray-500 mt-0.5">Basierend auf Wetter + deinem Fangbuch</p>
        </div>
        <button type="button"
          onClick={analyze}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {loading ? "Analysiere..." : data ? "Neu laden" : "Analysieren"}
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-3 text-gray-400 text-sm py-4">
          <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          KI analysiert dein Fangbuch und das aktuelle Wetter...
        </div>
      )}

      {!loading && data && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Wetterbewertung</span>
            <span className={`font-bold ${ratingColor[data.recommendation.weather_rating] || 'text-gray-300'}`}>
              {data.recommendation.weather_rating}
            </span>
            <span className="text-xs text-gray-600">({data.catchCount} Faenge analysiert)</span>
          </div>

          <div className="space-y-2">
            <p className="text-gray-200 text-sm leading-relaxed">{data.recommendation.summary}</p>
            <SpeakButton
              autoPlay
              text={[
                data.recommendation.summary,
                data.recommendation.optimal_times?.length ? `Optimale Zeiten: ${data.recommendation.optimal_times.join(', ')}.` : '',
                data.recommendation.recommended_baits?.length ? `Empfohlene Koeder: ${data.recommendation.recommended_baits.join(', ')}.` : '',
                data.recommendation.target_species?.length ? `Zielfische: ${data.recommendation.target_species.join(', ')}.` : '',
                data.recommendation.tips?.length ? `Tipps: ${data.recommendation.tips.join('. ')}.` : ''
              ].filter(Boolean).join(' ')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {data.recommendation.optimal_times?.length > 0 && (
              <div className="bg-gray-800/50 rounded-xl p-3 space-y-2">
                <div className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Optimale Zeiten</div>
                {data.recommendation.optimal_times.map((t, i) => (
                  <div key={i} className="text-sm text-gray-300">{t}</div>
                ))}
              </div>
            )}
            {data.recommendation.recommended_baits?.length > 0 && (
              <div className="bg-gray-800/50 rounded-xl p-3 space-y-2">
                <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Empfohlene Koeder</div>
                {data.recommendation.recommended_baits.map((b, i) => (
                  <div key={i} className="text-sm text-gray-300">{b}</div>
                ))}
              </div>
            )}
            {data.recommendation.target_species?.length > 0 && (
              <div className="bg-gray-800/50 rounded-xl p-3 space-y-2">
                <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Zielfische</div>
                {data.recommendation.target_species.map((s, i) => (
                  <div key={i} className="text-sm text-gray-300">{s}</div>
                ))}
              </div>
            )}
          </div>

          {data.recommendation.tips?.length > 0 && (
            <div className="border-t border-gray-800/50 pt-3 space-y-1">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tipps</div>
              {data.recommendation.tips.map((tip, i) => (
                <div key={i} className="text-sm text-gray-300 flex gap-2">
                  <span className="text-cyan-500 flex-shrink-0">-</span>
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && !data && (
        <p className="text-sm text-gray-500 py-2">
          Klicke auf Analysieren, um personalisierte Empfehlungen basierend auf deinen Faengen und dem aktuellen Wetter zu erhalten.
        </p>
      )}
    </div>
  );
}