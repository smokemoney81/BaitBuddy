import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Droplets, AlertTriangle, ArrowRight } from "lucide-react";
import { entities } from "@/api/frontendClient";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function MiniWaterAnalysis() {
  const [lastAnalysis, setLastAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLastAnalysis();
  }, []);

  const loadLastAnalysis = async () => {
    try {
      // Nur die letzte Analyse laden - Performance-Optimierung
      const analyses = await entities.WaterAnalysisHistory.list('-analyzed_at', 1);
      if (analyses.length > 0) {
        setLastAnalysis(analyses[0]);
      }
    } catch (error) {
      console.error("Failed to load water analysis:", error);
    } finally {
      setLoading(false);
    }
  };

  const getQualityColor = (score) => {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    return "text-red-400";
  };

  const _getQualityLabel = (score) => {
    if (score >= 80) return "Ausgezeichnet";
    if (score >= 60) return "Gut";
    return "Mäßig";
  };

  if (loading) {
    return (
      <Card className="glass-morphism border-gray-800">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Droplets className="w-5 h-5 text-cyan-400 animate-pulse" />
            <span className="text-gray-400 text-sm">Lade Analyse...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!lastAnalysis) {
    return (
      <Card className="glass-morphism border-gray-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Droplets className="w-5 h-5 text-cyan-400" />
              <div>
                <div className="text-sm font-medium text-white">Gewässer-Analyse</div>
                <div className="text-xs text-gray-400">Noch keine Daten</div>
              </div>
            </div>
            <Link to={createPageUrl('WaterAnalysis')}>
              <Button size="sm" variant="outline" className="border-cyan-600/50 hover:bg-cyan-600/20">
                Starten
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const daysSince = Math.floor((new Date() - new Date(lastAnalysis.analyzed_at)) / (1000 * 60 * 60 * 24));
  const isRecent = daysSince < 7;

  return (
    <Card className="glass-morphism border-gray-800 hover:border-cyan-600/50 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-cyan-400" />
            <span className="text-sm font-medium text-white">Gewässer-Analyse</span>
          </div>
          {!isRecent && (
            <AlertTriangle className="w-4 h-4 text-amber-400" title="Analyse veraltet" />
          )}
        </div>

        <div className="space-y-2 mb-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Qualitäts-Score</span>
            <span className={`text-lg font-bold ${getQualityColor(lastAnalysis.quality_score)}`}>
              {lastAnalysis.quality_score}/100
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Temperatur</span>
            <span className="text-sm text-white">{lastAnalysis.temperature != null ? lastAnalysis.temperature.toFixed(1) : 'N/A'}°C</span>
          </div>

          {lastAnalysis.chlorophyll_a && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Chlorophyll</span>
              <span className="text-sm text-white">{lastAnalysis.chlorophyll_a.toFixed(1)} mg/m³</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-700">
          <span className="text-xs text-gray-500">
            {daysSince === 0 ? 'Heute' : `vor ${daysSince} Tag${daysSince !== 1 ? 'en' : ''}`}
          </span>
          <Link to={createPageUrl('WaterAnalysis')}>
            <Button size="sm" variant="ghost" className="h-7 text-cyan-400 hover:text-cyan-300">
              Details
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}