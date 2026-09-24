import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import SwipeToRefresh from "@/components/utils/SwipeToRefresh";
import RankSection from "@/components/rank/RankSection";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";

import PremiumGuard from "@/components/premium/PremiumGuard";
import PageTitle from "@/components/layout/PageTitle";

export default function Rank() {
  return (
    <PremiumGuard requiredPlan="pro" feature="Community-Ranking">
      <RankInner />
    </PremiumGuard>
  );
}

function RankInner() {
  useFeatureTracking("leaderboard");
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["leaderboard-entries"] });
    queryClient.invalidateQueries({ queryKey: ["users"] });
  };

  return (
    <SwipeToRefresh onRefresh={handleRefresh}>
      <div className="min-h-screen px-4 pb-32">
        <div className="max-w-6xl mx-auto">
          <PageTitle className="mb-4" title="Community Ranglisten" subtitle="Wer fängt am meisten? Vergleiche dich mit anderen Anglern." />
          <RankSection />
        </div>
      </div>
    </SwipeToRefresh>
  );
}