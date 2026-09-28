import React, { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { Catch } from '@/entities/Catch';
import { pickTopInsight } from '@/lib/fishingInsights';

// BaitBuddy-Insight (Spec §22, Bereich 4): genau EINE wichtige, persönliche
// Erkenntnis aus echten Fangdaten. Kein Insight -> dezenter Hinweis statt
// erfundener Statistik (Spec §33). Kompakte Kachel der Dashboard-Übersicht.
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

  return (
    <section className="bb-home-tile" aria-label="BaitBuddy Insight" aria-busy={loading}>
      <span className="bb-home-tile-label is-gold"><Lightbulb size={14} aria-hidden="true" />Insight</span>
      {loading ? (
        <span className="bb-home-tile-meta">Wird ausgewertet …</span>
      ) : insight ? (
        <p className="bb-home-tile-text">{insight.text}</p>
      ) : (
        <p className="bb-home-tile-meta">Speichere ein paar Fänge — dann erkennt BaitBuddy deine besten Zeiten und Köder.</p>
      )}
    </section>
  );
}
