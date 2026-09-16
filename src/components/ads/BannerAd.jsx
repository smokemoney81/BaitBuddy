import React, { useEffect, useRef } from 'react';
import { trackAdEvent } from '@/lib/adAnalytics';

/**
 * Kleines Bottom-Banner für Basic-Nutzer.
 * Erscheint über der Navigation, nie über Bedienelementen.
 *
 * Props:
 *   ad       — { title, ctaUrl }
 *   placement — Seiten-Kontext
 *   userPlan
 */
export default function BannerAd({ ad, placement, userPlan = 'free' }) {
  const ref = useRef(null);
  const tracked = useRef(false);

  useEffect(() => {
    if (!ref.current || tracked.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !tracked.current) {
          tracked.current = true;
          trackAdEvent('banner_impression', { placement, user_plan: userPlan });
          observer.disconnect();
        }
      },
      { threshold: 0.8 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [placement, userPlan]);

  const handleClick = () => {
    trackAdEvent('banner_clicked', { placement, user_plan: userPlan });
    if (ad?.ctaUrl) window.open(ad.ctaUrl, '_blank', 'noopener,noreferrer');
  };

  const label = ad?.title ?? 'Partner-Anzeige';

  return (
    <button
      ref={ref}
      onClick={handleClick}
      className="w-full flex items-center justify-between px-4 py-2 bg-slate-900/80 border-t border-slate-700/40 backdrop-blur-sm"
      style={{ minHeight: 44 }}
    >
      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mr-3 flex-shrink-0">
        Anzeige
      </span>
      <span className="text-xs text-slate-300 truncate flex-1 text-left">{label}</span>
      <span className="text-xs text-cyan-400 font-medium ml-3 flex-shrink-0">Mehr</span>
    </button>
  );
}
