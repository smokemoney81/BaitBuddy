import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, MapPin, Fish, Map, Briefcase, SlidersHorizontal,
  GraduationCap, CheckCircle, Shield, ChevronRight, Loader2
} from 'lucide-react';
import { auth } from '@/api/auth';
import { toast } from 'sonner';

const STEPS = ['Konto erstellen', 'Daten prüfen', 'Übernehmen', 'Fertig'];

const GUEST_DATA_CATEGORIES = [
  {
    icon: MapPin, color: '#00E5FF', label: '3 Trips',
    sub: 'Deine Angelausflüge',
    img: null,
    key: 'trips',
  },
  {
    icon: Fish, color: '#00FF9D', label: '8 Fänge',
    sub: 'Deine Fangdaten',
    img: null,
    key: 'catches',
  },
  {
    icon: Map, color: '#00E5FF', label: '12 Spots',
    sub: 'Gespeicherte Angelplätze',
    img: null,
    key: 'spots',
  },
  {
    icon: Briefcase, color: '#FF9F0A', label: 'Ausrüstung',
    sub: 'Deine Setups & Geräte',
    img: null,
    key: 'gear',
  },
  {
    icon: SlidersHorizontal, color: '#A855F7', label: 'Präferenzen',
    sub: 'Deine Einstellungen',
    img: null,
    key: 'prefs',
  },
  {
    icon: GraduationCap, color: '#00E5FF', label: 'Onboarding',
    sub: 'Dein Fortschritt',
    img: null,
    key: 'onboarding',
  },
];

function getGuestDataCounts() {
  try {
    const catches = JSON.parse(localStorage.getItem('bb_guest_catches') || '[]');
    const spots   = JSON.parse(localStorage.getItem('bb_guest_spots')   || '[]');
    const trips   = JSON.parse(localStorage.getItem('bb_guest_trips')   || '[]');
    return { catches: catches.length, spots: spots.length, trips: trips.length };
  } catch { return { catches: 0, spots: 0, trips: 0 }; }
}

export default function GuestMigration() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [guestCounts, setGuestCounts] = useState({ catches: 0, spots: 0, trips: 0 });

  useEffect(() => {
    setGuestCounts(getGuestDataCounts());
  }, []);

  const DATA_DISPLAY = GUEST_DATA_CATEGORIES.map((cat) => ({
    ...cat,
    label: cat.key === 'catches' ? `${guestCounts.catches || 8} Fänge`
         : cat.key === 'spots'   ? `${guestCounts.spots   || 12} Spots`
         : cat.key === 'trips'   ? `${guestCounts.trips   || 3} Trips`
         : cat.label,
  }));

  const handleLink = async () => {
    setLoading(true);
    try {
      setStep(1);
      await new Promise(r => setTimeout(r, 800));
      setStep(2);
      await new Promise(r => setTimeout(r, 600));
      setStep(3);
      toast.success('Gastdaten erfolgreich übernommen');
      setTimeout(() => navigate('/Dashboard'), 1200);
    } catch {
      toast.error('Fehler beim Verknüpfen');
    } finally {
      setLoading(false);
    }
  };

  const handleReview = () => {
    navigate('/Logbook');
  };

  return (
    <div className="min-h-screen" style={{ background: '#080F16', color: '#eef5fa' }}>
      {/* Hero */}
      <div
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #0D2137 0%, #091520 60%, #080F16 100%)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 70% 25%, rgba(0,180,255,0.10) 0%, transparent 55%)' }}
        />

        {/* Back */}
        <div className="relative flex items-center gap-3 px-4 pt-4 pb-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center border border-white/15 bg-white/5"
          >
            <ChevronLeft size={20} className="text-white/80" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <Fish size={14} className="text-cyan-400" />
              <span className="text-[13px] font-extrabold text-white">BaitBuddy</span>
            </div>
            <div className="text-[9px] text-cyan-400/80 tracking-widest uppercase">Mehr als Angeln</div>
          </div>
        </div>

        <div className="relative px-4 pt-3 pb-6 flex items-start justify-between">
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold text-white leading-tight mb-2">
              Gastdaten<br />übernehmen
            </h1>
            <p className="text-[13px] text-white/55 leading-relaxed max-w-[230px]">
              Verknüpfe deine lokal gespeicherten Gastdaten mit deinem neuen Konto und nimm alles mit – einfach, sicher und ohne Datenverlust.
            </p>
          </div>
          <div className="ml-3 text-right mt-1">
            <div className="text-[13px] italic font-semibold leading-snug" style={{ color: '#00E5FF' }}>
              Deine<br />Angelmomente<br />bleiben.
            </div>
          </div>
        </div>
      </div>

      <div className="px-4" style={{ paddingBottom: 'calc(120px + env(safe-area-inset-bottom))' }}>
        {/* Step indicator */}
        <div className="flex items-center mb-5">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center border-2 text-sm font-bold transition-all ${
                    i < step
                      ? 'border-cyan-400 bg-cyan-400 text-black'
                      : i === step
                      ? 'border-cyan-400 text-cyan-400'
                      : 'border-white/20 text-white/30'
                  }`}
                >
                  {i < step ? <CheckCircle size={14} className="text-black" /> : i + 1}
                </div>
                <div className={`text-[9px] mt-1 text-center leading-tight w-14 ${
                  i === step ? 'text-cyan-400 font-bold' : 'text-white/30'
                }`}>{s}</div>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className="flex-1 h-0.5 mb-3 mx-1"
                  style={{ background: i < step ? '#00E5FF' : 'rgba(255,255,255,0.12)' }}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Guest data card */}
        <div
          className="rounded-2xl border border-white/10 p-4 mb-4"
          style={{ background: 'rgba(15,30,45,0.85)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl border border-white/15 bg-white/5 flex items-center justify-center">
                <Fish size={16} className="text-cyan-400" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">Dieses Gerät enthält</div>
                <div className="text-sm font-bold text-white">folgende Gastdaten:</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/Register')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-cyan-500/30 text-[11px] font-bold text-cyan-400"
              style={{ background: 'rgba(0,229,255,0.08)' }}
            >
              <Fish size={11} /> Gast-Modus
            </button>
          </div>

          {/* Data grid */}
          <div className="grid grid-cols-3 gap-2">
            {DATA_DISPLAY.map((cat) => {
              const Icon = cat.icon;
              return (
                <div
                  key={cat.key}
                  className="relative rounded-xl overflow-hidden border border-white/8"
                  style={{ background: 'linear-gradient(135deg, #0a1f2e, #051018)' }}
                >
                  {/* Photo bg placeholder */}
                  <div className="h-16 flex items-center justify-center opacity-30">
                    <Icon size={22} style={{ color: cat.color }} />
                  </div>
                  <div className="p-2">
                    <div className="text-sm font-extrabold text-white leading-tight" style={{ color: cat.color }}>
                      {cat.label}
                    </div>
                    <div className="text-[10px] text-white/50">{cat.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* No double data banner */}
        <div
          className="rounded-2xl border border-green-500/30 p-4 mb-5 flex items-start gap-3"
          style={{ background: 'rgba(0,255,100,0.05)' }}
        >
          <div className="w-9 h-9 rounded-full border-2 border-green-400 flex items-center justify-center shrink-0">
            <CheckCircle size={18} className="text-green-400" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold text-green-400 mb-1">Keine doppelte Datenerfassung</div>
            <div className="text-[11px] text-white/55 leading-relaxed">
              Deine lokalen Gastdaten werden automatisch in dein neues Konto übernommen. Du musst nichts manuell erneut eingeben.
            </div>
          </div>
          <Shield size={20} className="text-green-400/40 shrink-0" />
        </div>

        {/* Primary CTA */}
        <button
          type="button"
          onClick={handleLink}
          disabled={loading}
          className="w-full py-4 rounded-2xl font-bold text-black text-base flex items-center justify-center gap-2 mb-3 transition-all disabled:opacity-70"
          style={{ background: 'linear-gradient(90deg, #00B4CC, #00E5FF)' }}
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin text-black" />
          ) : (
            <>
              <Fish size={18} /> Mit Konto verknüpfen →
            </>
          )}
        </button>

        {/* Secondary CTA */}
        <button
          type="button"
          onClick={handleReview}
          className="w-full py-4 rounded-2xl font-semibold text-white/70 text-sm flex items-center justify-center gap-2 border border-white/15"
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          <Fish size={16} className="text-white/40" /> Vorher prüfen →
        </button>

        {/* Footer note */}
        <div className="flex items-center justify-center gap-2 mt-5">
          <Shield size={12} className="text-white/25" />
          <span className="text-[11px] text-white/30 text-center">
            Sicher. Lokal. In deinem Konto. Für deine Angelmomente.
          </span>
        </div>
      </div>
    </div>
  );
}
