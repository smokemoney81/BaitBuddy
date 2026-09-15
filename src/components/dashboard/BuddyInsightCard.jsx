import React, { useEffect, useState } from 'react';
import { Lightbulb, Loader2 } from 'lucide-react';
import { Catch } from '@/entities/Catch';
import { pickTopInsight } from '@/lib/fishingInsights';

// BaitBuddy-Insight (Spec §22, Bereich 4): genau EINE wichtige, persönliche
// Erkenntnis aus echten Fangdaten. Kein Insight -> dezenter Hinweis statt
// erfundener Statistik (Spec §33).
export default function BuddyInsightCard() {
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await Catch.list('-catch_time', 100);
        if (alive) setInsight(pickTopInsight(Array.isArray(list) ? list : []));
      } catch {
        if (alive) setInsight(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <section className="bb-card" aria-label="BaitBuddy Insight" aria-busy="true">
        <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Erkenntnisse werden geladen …</div>
      </section>
    );
  }

  return (
    <section className="bb-card" aria-label="BaitBuddy Insight">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300">
          <Lightbulb size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-cyan-300/90">BaitBuddy Insight</h2>
          {insight ? (
            <p className="mt-1 text-sm text-slate-200 leading-relaxed">{insight.text}</p>
          ) : (
            <p className="mt-1 text-sm text-slate-400 leading-relaxed">
              Speichere ein paar Fänge im Fangbuch — dann erkennt BaitBuddy deine besten Zeiten, Köder und Zielfische.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
