import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Crown, Star, Trophy, ChevronRight, Info, Fish, Lock } from "lucide-react";
import { auth } from "@/api/auth";
import { api } from "@/api/frontendClient";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import { toast } from "sonner";

const REWARD_TYPES = [
  { icon: '⬡', label: 'XP', sub: 'Erfahrung sammeln', color: '#00E5FF', bgColor: 'rgba(0,229,255,0.12)' },
  { icon: '★', label: 'Badge', sub: 'Erfolge freischalten', color: '#FFD60A', bgColor: 'rgba(255,214,10,0.12)' },
  { icon: '♛', label: 'Premium-Zugang', sub: 'Exklusive Funktionen', color: '#FFD60A', bgColor: 'rgba(255,214,10,0.12)' },
  { icon: '📅', label: 'Profi-Status', sub: 'Zeitlich begrenzt', color: '#FFD60A', bgColor: 'rgba(255,214,10,0.12)' },
  { icon: '🛡', label: 'Event-Badge', sub: 'Spezielle Auszeichnungen', color: '#00E5FF', bgColor: 'rgba(0,229,255,0.12)' },
];

const EVENT_REWARDS = [
  { name: 'Spezial-Köder', sub: 'Zander Edition', unlocked: true, img: null, color: '#00FF9D' },
  { name: 'BaitBuddy Cap', sub: 'Limited Edition', unlocked: true, img: null, color: '#00FF9D' },
  { name: 'Geheim-Spot', sub: 'Alpensee Zugang', unlocked: false, xp: 2450, xpTotal: 5000, img: null, color: '#00E5FF' },
  { name: 'Event-Badge', sub: 'Zander Masters', unlocked: false, events: '0 / 1 Event', img: null, color: '#00E5FF' },
];

export default function Rank() {
  useFeatureTracking("leaderboard");
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [level, setLevel] = useState(12);
  const [xp, setXp] = useState(7550);
  const [xpToNext, setXpToNext] = useState(10000);
  const [plan, setPlan] = useState('Pro Plan');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentUser = await auth.me();
      setUser(currentUser);
      const meta = currentUser?.user_metadata || currentUser?.metadata || {};
      if (meta.xp) setXp(meta.xp);
      if (meta.level) setLevel(meta.level);
      const eventsRes = await api.get('/events?limit=4');
      if (eventsRes?.data) setEvents(eventsRes.data.slice(0, 4));
    } catch {}
    setLoading(false);
  };

  const xpPercent = Math.min(100, Math.round((xp / xpToNext) * 100));
  const xpToNextLevel = xpToNext - xp;

  const PLAN_COLORS = {
    'Pro Plan': '#00E5FF',
    'Ultimate': '#FFD60A',
    'Basic': '#7B8FE5',
    'Free': '#888',
  };
  const planColor = PLAN_COLORS[plan] || '#00E5FF';

  return (
    <div className="min-h-screen" style={{ background: '#080F16', color: '#eef5fa' }}>
      {/* Hero */}
      <div
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #0D1F30 0%, #091520 60%, #080F16 100%)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 60% 30%, rgba(0,200,255,0.09) 0%, transparent 60%)' }} />

        <div className="relative px-4 pt-4 pb-0 flex items-center justify-between">
          <button type="button" onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center border border-white/15 bg-white/5">
            <ChevronLeft size={20} className="text-white/80" />
          </button>
          <button type="button" className="w-9 h-9 rounded-full flex items-center justify-center border border-white/15 bg-white/5">
            <Info size={16} className="text-white/60" />
          </button>
        </div>

        <div className="relative px-4 pt-4 pb-6 text-center">
          <h1 className="text-2xl font-extrabold text-white mb-1">Level &amp; Rewards</h1>
          <p className="text-sm text-white/40">Angeln. Erleben. Aufsteigen.</p>
        </div>
      </div>

      <div className="px-4" style={{ paddingBottom: 'calc(100px + env(safe-area-inset-bottom))' }}>

        {/* User card */}
        <div className="rounded-2xl border border-white/10 p-4 mb-4 -mt-2"
          style={{ background: 'rgba(15,30,45,0.85)' }}>
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-amber-400/60"
                style={{ background: 'linear-gradient(135deg, #1a3a4a, #0a1f2e)' }}>
                <div className="w-full h-full flex items-center justify-center">
                  <Fish size={28} className="text-cyan-400/60" />
                </div>
              </div>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amber-500/20 border border-amber-400/60 flex items-center justify-center">
                <Crown size={10} className="text-amber-400" />
              </div>
            </div>

            {/* Level + XP */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <div className="text-2xl font-extrabold text-white">Level {level}</div>
                <button
                  type="button"
                  onClick={() => navigate('/PremiumPlans')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border"
                  style={{ borderColor: planColor + '60', background: planColor + '15', color: planColor }}
                >
                  <Crown size={10} />
                  <span className="text-[11px] font-bold">{plan}</span>
                  <ChevronRight size={10} />
                </button>
              </div>
              <div className="text-sm text-white/50 mb-2">{xpToNextLevel.toLocaleString()} XP bis Level {level + 1}</div>
              {/* XP bar */}
              <div className="w-full h-2 rounded-full bg-white/8 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${xpPercent}%`, background: 'linear-gradient(90deg, #00B4CC, #00E5FF)' }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-white/30">{xp.toLocaleString()} / {xpToNext.toLocaleString()} XP</span>
                <span className="text-[10px] text-cyan-400">{xpPercent}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Reward types grid */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          {REWARD_TYPES.map((rt) => (
            <div
              key={rt.label}
              className="rounded-xl p-2 flex flex-col items-center text-center border border-white/8"
              style={{ background: rt.bgColor }}
            >
              <div className="text-lg mb-1" style={{ color: rt.color }}>{rt.icon}</div>
              <div className="text-[10px] font-bold text-white/80 leading-tight">{rt.label}</div>
              <div className="text-[9px] text-white/40 leading-tight mt-0.5">{rt.sub}</div>
            </div>
          ))}
        </div>

        {/* Pro plan benefit banner */}
        <div
          className="rounded-2xl border border-amber-400/20 overflow-hidden mb-4"
          style={{ background: 'rgba(15,25,15,0.85)' }}
        >
          <div className="relative p-4">
            <div className="absolute inset-0 opacity-10"
              style={{ background: 'linear-gradient(135deg, #00ff9d22, transparent)' }} />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <Crown size={16} className="text-amber-400" />
                <span className="text-sm font-bold text-amber-400">Dein Vorteil als {plan.replace(' Plan', '')}</span>
              </div>
              <div className="space-y-2 mb-4">
                {[
                  'Alle Premium-Funktionen',
                  'Exklusive Angelspots',
                  'Spezielle Events',
                  '2× schnellere XP',
                ].map((benefit) => (
                  <div key={benefit} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border-2 border-green-400 flex items-center justify-center shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    </div>
                    <span className="text-sm text-white/80">{benefit}</span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => navigate('/PremiumPlans')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/20 text-sm font-semibold text-white/80"
                style={{ background: 'rgba(255,255,255,0.05)' }}
              >
                Mehr erfahren
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Event rewards */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base">🎁</span>
                <span className="text-sm font-bold text-white">Belohnungen aus Events</span>
              </div>
              <div className="text-[11px] text-white/40 mt-0.5">
                Nimm an Events teil, sammle XP und sichere dir exklusive Rewards!
              </div>
            </div>
            <button type="button" onClick={() => navigate('/Events')}
              className="flex items-center gap-1 text-[11px] text-cyan-400 font-semibold">
              Alle Events <ChevronRight size={12} />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {EVENT_REWARDS.map((reward) => (
              <div
                key={reward.name}
                className="relative rounded-xl overflow-hidden border border-white/10"
                style={{ background: 'rgba(15,30,45,0.8)' }}
              >
                {/* Image area */}
                <div
                  className="w-full aspect-square flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #0a1f2e, #051018)' }}
                >
                  {reward.unlocked ? (
                    <Trophy size={24} className="text-amber-400/60" />
                  ) : (
                    <Lock size={20} className="text-white/20" />
                  )}
                </div>

                {/* Unlocked check */}
                {reward.unlocked && (
                  <div
                    className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center border border-green-400"
                    style={{ background: 'rgba(0,255,100,0.15)' }}
                  >
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                  </div>
                )}

                <div className="p-1.5">
                  {reward.unlocked ? (
                    <div className="text-[9px] font-bold text-green-400 mb-0.5">Freigeschaltet</div>
                  ) : null}
                  <div className="text-[10px] font-bold text-white leading-tight">{reward.name}</div>
                  <div className="text-[9px] text-white/40">{reward.sub}</div>

                  {!reward.unlocked && reward.xp && (
                    <>
                      <div className="text-[9px] text-white/40 mt-1">{reward.xp.toLocaleString()} / {reward.xpTotal.toLocaleString()} XP</div>
                      <div className="w-full h-1 rounded-full bg-white/10 mt-0.5 overflow-hidden">
                        <div className="h-full rounded-full bg-cyan-500"
                          style={{ width: `${(reward.xp / reward.xpTotal) * 100}%` }} />
                      </div>
                    </>
                  )}
                  {!reward.unlocked && reward.events && (
                    <div className="text-[9px] text-white/40 mt-1">{reward.events}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Redeem button */}
        <button
          type="button"
          onClick={() => toast.info('Rewards-Einlösung kommt bald')}
          className="w-full py-4 rounded-2xl font-bold text-black text-base flex items-center justify-center gap-2 transition-all active:scale-98"
          style={{ background: 'linear-gradient(90deg, #00B4CC, #00E5FF)' }}
        >
          🎁 Rewards einlösen
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
