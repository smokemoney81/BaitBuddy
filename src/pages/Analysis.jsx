import React from "react";
import AnalysisSection from "@/components/analysis/AnalysisSection";
import { useRef } from "react";

import PremiumGuard from "@/components/premium/PremiumGuard";
import PageTitle from "@/components/layout/PageTitle";

export default function Analysis() {
  return (
    <PremiumGuard requiredPlan="elite" feature="Profi-Analyse: Zeitreihen & Trends">
      <AnalysisInner />
    </PremiumGuard>
  );
}

function AnalysisInner() {
  const analysisResultsRef = useRef(null);

  const announceAnalysisResult = (message) => {
    if (analysisResultsRef?.current) {
      analysisResultsRef.current.textContent = message;
    }
  };

  return (
    <div className="min-h-screen px-4 pb-32">
      <PageTitle className="mb-4" title="Fang-Analyse Profi" subtitle="Zeitreihen, Trends und Muster aus deinen Fängen." />
      <div 
        ref={analysisResultsRef}
        role="region"
        aria-live="polite"
        aria-label="Analyseergebnisse"
        className="sr-only"
      />
      <div className="max-w-6xl mx-auto">
        <AnalysisSection onResultsUpdate={announceAnalysisResult} />
      </div>
    </div>
  );
}