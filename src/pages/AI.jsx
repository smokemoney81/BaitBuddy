import React, { Suspense, lazy } from "react";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";

const CameraAnalysisSection = lazy(() => import("@/components/ai/CameraAnalysisSection"));
const BiteDetectorSection = lazy(() => import("@/components/ai/BiteDetectorSection"));
const FishBehaviorAnalysisSection = lazy(() => import("@/components/ai/FishBehaviorAnalysisSection"));

const SectionSkeleton = () => (
  <div className="w-full h-48 rounded-2xl bg-gray-800/50 animate-pulse flex items-center justify-center">
    <div className="text-gray-500 text-sm">Wird geladen...</div>
  </div>
);

import PremiumGuard from "@/components/premium/PremiumGuard";
import PageTitle from "@/components/layout/PageTitle";

export default function AI() {
  return (
    <PremiumGuard requiredPlan="elite" feature="KI-Echtzeit-Kamera & Live-Bissanzeiger">
      <AIInner />
    </PremiumGuard>
  );
}

function AIInner() {
  useFeatureTracking("bite_detector");
  return (
    <div className="min-h-screen px-4 sm:px-6 pb-32">
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 py-4 sm:py-6">
        <PageTitle title="KI-Kamera & Bisserkennung" subtitle="Fischarten erkennen und keinen Biss mehr verpassen." />

        <div>
          <Suspense fallback={<SectionSkeleton />}>
            <CameraAnalysisSection />
          </Suspense>
        </div>

        <div>
          <Suspense fallback={<SectionSkeleton />}>
            <BiteDetectorSection />
          </Suspense>
        </div>

        <div>
          <Suspense fallback={<SectionSkeleton />}>
            <FishBehaviorAnalysisSection />
          </Suspense>
        </div>
      </div>
    </div>
  );
}