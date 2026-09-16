import React, { useEffect, useRef } from 'react';
import { trackAdEvent } from '@/lib/adAnalytics';

/**
 * Native Ad Card — fügt sich in Content-Listen ein.
 * Design folgt BaitBuddy 2.0 (Dark Navy, Slate Surface, dezente Border).
 * Muss klar als "Anzeige" erkennbar sein.
 *
 * Props:
 *   ad       — { title, body, cta, ctaUrl, imageUrl } vom Ad-Server
 *   placement — z. B. 'nearby_spots', 'community_feed', 'catch_log'
 *   userPlan
 */
export default function NativeAdCard({ ad, placement, userPlan = 'free' }) {
  const ref = useRef(null);
  const tracked = useRef(false);

  useEffect(() => {
    if (!ref.current || tracked.current) return;
    // Impression tracken sobald sichtbar
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !tracked.current) {
          tracked.current = true;
          trackAdEvent('native_ad_impression', {
            ad_type: 'native',
            placement,
            user_plan: userPlan,
          });
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [placement, userPlan]);

  const handleClick = () => {
    trackAdEvent('native_ad_clicked', { placement, user_plan: userPlan });
    if (ad?.ctaUrl) window.open(ad.ctaUrl, '_blank', 'noopener,noreferrer');
  };

  // Fallback-Placeholder wenn kein Ad-Content geladen
  const title = ad?.title ?? 'BaitBuddy Partner';
  const body = ad?.body ?? 'Entdecke die besten Angelprodukte';
  const cta = ad?.cta ?? 'Mehr erfahren';

  return (
    <div ref={ref} className="mx-0 my-1">
      {/* Trennlinie mit Anzeige-Label */}
      <div className="flex items-center gap-2 px-1 mb-1.5">
        <div className="flex-1 h-px bg-slate-700/40" />
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
          Anzeige
        </span>
        <div className="flex-1 h-px bg-slate-700/40" />
      </div>

      <button
        onClick={handleClick}
        className="w-full text-left rounded-xl border border-slate-700/40 bg-slate-800/60 hover:bg-slate-800/80 transition-colors overflow-hidden"
      >
        <div className="flex items-center gap-3 p-3">
          {/* Ad-Bild */}
          {ad?.imageUrl ? (
            <img
              src={ad.imageUrl}
              alt=""
              className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-slate-700"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-slate-700/60 flex-shrink-0" />
          )}

          {/* Ad-Text */}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-200 truncate">{title}</div>
            <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">{body}</div>
          </div>

          {/* CTA */}
          <span className="flex-shrink-0 text-xs text-cyan-400 font-medium whitespace-nowrap">
            {cta}
          </span>
        </div>
      </button>

      <div className="flex items-center gap-2 px-1 mt-1.5">
        <div className="flex-1 h-px bg-slate-700/40" />
      </div>
    </div>
  );
}
