import React from 'react';
import { Link } from 'react-router-dom';
import { Gift, ChevronRight } from 'lucide-react';
import { createPageUrl } from '@/utils';

/**
 * FreeModeNotice - Hinweis am Dashboard, dass BaitBuddy im kostenlosen Modus läuft.
 * Alle Features sind verfügbar und nutzbar, ohne Einschränkungen.
 */
export default function FreeModeNotice() {
  return (
    <Link
      to={createPageUrl('PremiumPlans')}
      className="flex items-center gap-3 rounded-2xl border border-emerald-500/60 bg-emerald-950/60 backdrop-blur-sm p-4 transition-colors hover:brightness-110"
      role="status"
    >
      <Gift className="w-6 h-6 shrink-0 text-emerald-300" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-300">
          Kostenloser Modus
        </div>
        <div className="text-white font-semibold">
          BaitBuddy ist im kostenlosen Modus und im vollen Umfang für dich nutzbar
        </div>
        <div className="text-xs text-gray-300 mt-0.5">
          Entdecke optional Premium-Features oder continue kostenlos
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
    </Link>
  );
}
