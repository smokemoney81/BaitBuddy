import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/api/auth";
import { api } from "@/api/frontendClient";
import {
  Search, Bell, ChevronRight, Trophy, Heart, MapPin,
  Calendar, Clock, Users, Loader2, Fish
} from "lucide-react";
import EventLauncher from "@/components/events/EventLauncher";

const FILTER_TABS = [
  { id: 'fuer-dich', label: 'Für dich', icon: '⚡' },
  { id: 'naehe',    label: 'In der Nähe', icon: null, lucide: MapPin },
  { id: 'freunde',  label: 'Freunde', icon: null, lucide: Users },
  { id: 'community',label: 'Community', icon: null, lucide: Fish },
  { id: 'vereine',  label: 'Vereine', icon: '🏛️' },
  { id: 'meine',    label: 'Meine Events', icon: null, lucide: Calendar },
];

const EVENT_TYPE_COLORS = {
  turnier:        '#FFD60A',
  community:      '#00FF9D',
  vereins:        '#00E5FF',
  empfohlen:      '#00FF9D',
};

function EventTypeTag({ type }) {
  const color = EVENT_TYPE_COLORS[type?.toLowerCase()] || '#00E5FF';
  const labels = {
    turnier: 'Turnier',
    community: 'Community Event',
    vereins: 'Vereins-Event',
    empfohlen: 'Empfohlen für dich',
  };
  return (
    <div
      className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"
      style={{ background: color + '25', border: `1px solid ${color}60`, color }}
    >
      {type === 'turnier' && <Trophy size={9} />}
      {type === 'vereins' && '🌿'}
      {type === 'community' && <Calendar size={9} />}
      {labels[type?.toLowerCase()] || type}
    </div>
  );
}

function HeroEventCard({ event, onNavigate }) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden mb-3"
      style={{ background: 'linear-gradient(135deg, #0a1f2e 0%, #051018 100%)', border: '1px solid rgba(0,229,255,0.25)' }}
    >
      {/* Photo placeholder with gradient */}
      <div className="relative h-44"
        style={{ background: 'linear-gradient(160deg, #0D2A3A 0%, #051018 100%)' }}>
        <div className="absolute inset-0 flex items-end justify-center pb-4 opacity-20">
          <Fish size={80} className="text-cyan-300" />
        </div>

        <div className="absolute top-3 left-3">
          <div className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white flex items-center gap-1"
            style={{ background: 'rgba(0,255,100,0.2)', border: '1px solid rgba(0,255,100,0.4)' }}>
            ★ Empfohlen für dich
          </div>
        </div>
        {event.has_prizes && (
          <div className="absolute top-3 right-10">
            <div className="px-2 py-0.5 rounded-full text-[10px] font-bold text-amber-300 flex items-center gap-1"
              style={{ background: 'rgba(180,130,0,0.25)', border: '1px solid rgba(180,130,0,0.5)' }}>
              <Trophy size={8} /> Tolle Preise!
            </div>
          </div>
        )}
        <button type="button" className="absolute top-3 right-3 w-7 h-7 rounded-full flex items-center justify-center border border-white/20 bg-black/30">
          <Heart size={12} className="text-white/60" />
        </button>

        {/* Event name overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4"
          style={{ background: 'linear-gradient(transparent, rgba(5,16,24,0.95))' }}>
          <h2 className="text-xl font-extrabold text-white leading-tight mb-1">
            {event.name || 'Zander-Abend am Möhnesee'}
          </h2>
        </div>
      </div>

      {/* Event meta */}
      <div className="px-4 pt-2 pb-3">
        <div className="flex flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-1.5 text-[12px] text-white/60">
            <Calendar size={12} className="text-cyan-400" />
            {event.start_date ? new Date(event.start_date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }) : 'Sa, 21.09.'}
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-white/60">
            <Clock size={12} className="text-cyan-400" />
            {event.start_time || '18:30'}
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-white/60">
            <MapPin size={12} className="text-cyan-400" />
            {event.location || 'Möhnesee'}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-xl p-2 text-center border border-white/8" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="flex items-center justify-center mb-0.5">
              <Fish size={14} className="text-white/40" />
            </div>
            <div className="text-[9px] text-white/40">Zielarten</div>
            <div className="text-[11px] font-bold text-white">{event.target_species || 'Zander'}</div>
          </div>
          <div className="rounded-xl p-2 text-center border border-white/8" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="flex items-center justify-center gap-0.5 mb-0.5">
              <div className="w-3 h-3 rounded-full bg-cyan-400/60" />
              <div className="w-3 h-3 rounded-full bg-blue-400/60 -ml-1" />
            </div>
            <div className="text-[9px] text-white/40">Teilnehmer</div>
            <div className="text-[11px] font-bold text-white">{event.participant_count || 24}</div>
          </div>
          <div className="rounded-xl p-2 text-center border border-white/8" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <Trophy size={14} className="text-amber-400/60 mx-auto mb-0.5" />
            <div className="text-[9px] text-white/40">Rewards</div>
            <div className="text-[9px] font-bold text-amber-400 leading-tight">{event.reward_description || 'Tackle-Paket'}</div>
          </div>
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={() => onNavigate(event.id)}
          className="w-full py-3 rounded-xl font-bold text-black text-sm flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(90deg, #00B4CC, #00E5FF)' }}
        >
          <MapPin size={14} /> Trip aus Event erstellen →
        </button>
      </div>
    </div>
  );
}

function EventListCard({ event, onNavigate }) {
  const typeMap = { tournament: 'turnier', community: 'community', club: 'vereins' };
  const type = typeMap[event.type] || 'community';

  return (
    <button
      type="button"
      onClick={() => onNavigate(event.id)}
      className="w-full rounded-2xl border border-white/8 overflow-hidden mb-3 text-left"
      style={{ background: 'rgba(15,30,45,0.75)' }}
    >
      <div className="flex">
        {/* Thumbnail */}
        <div
          className="relative w-28 shrink-0 h-24 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #0a1f2e, #051018)' }}
        >
          <EventTypeTag type={type} />
          <Fish size={24} className="text-cyan-400/30" />
        </div>

        {/* Content */}
        <div className="flex-1 p-3">
          <div className="text-sm font-bold text-white mb-1 leading-tight">{event.name}</div>
          <div className="flex flex-wrap gap-2 mb-2">
            <div className="flex items-center gap-1 text-[10px] text-white/50">
              <Calendar size={9} className="text-cyan-400" />
              {event.start_date ? new Date(event.start_date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }) : ''}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-white/50">
              <Clock size={9} className="text-cyan-400" />
              {event.start_time || ''}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-white/50">
              <MapPin size={9} className="text-cyan-400" />
              {event.location || ''}
            </div>
          </div>

          {/* Stats inline */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-[10px] text-white/40">
              <Fish size={9} />
              <span className="font-semibold text-white/70">{event.target_species || 'Karpfen'}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-white/40">
              <Users size={9} />
              <span>{event.participant_count || 0} Teilnehmer</span>
            </div>
            {event.reward_description && (
              <div className="flex items-center gap-1 text-[10px] text-amber-400/80">
                <Trophy size={9} />
                <span>{event.reward_description}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center pr-3">
          <ChevronRight size={16} className="text-white/30" />
        </div>
      </div>
    </button>
  );
}

export default function Events() {
  const navigate = useNavigate();
  const [competitions, setCompetitions] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('fuer-dich');
  const [showLauncher, setShowLauncher] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [comps, user] = await Promise.all([
        api.get('/api/events').catch(() => []),
        auth.me().catch(() => null),
      ]);
      setCompetitions(Array.isArray(comps) ? comps : []);
      setCurrentUser(user);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleNavigate = (id) => navigate(`/events/${id}`);

  const heroEvent = competitions[0] || null;
  const listEvents = competitions.slice(1, 4);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#080F16' }}>
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#080F16', color: '#eef5fa' }}>
      {/* Hero */}
      <div
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #0A1E2E 0%, #07131D 55%, #080F16 100%)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 70% 30%, rgba(0,180,255,0.09) 0%, transparent 60%)' }} />

        {/* Top bar */}
        <div className="relative flex items-center justify-between px-4 pt-4 pb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Fish size={16} className="text-cyan-400" />
              <span className="text-base font-extrabold text-white">BaitBuddy</span>
            </div>
            <div className="text-2xl font-extrabold text-white">Events</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="w-9 h-9 rounded-full flex items-center justify-center border border-white/15 bg-white/5">
              <Search size={16} className="text-white/60" />
            </button>
            <button type="button" className="w-9 h-9 rounded-full flex items-center justify-center border border-white/15 bg-white/5 relative">
              <Bell size={16} className="text-white/60" />
              <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: '#00E5FF' }} />
            </button>
          </div>
        </div>

        {/* Subtitle */}
        <div className="relative px-4 pb-5">
          <p className="text-sm text-white/50">Gemeinsam mehr erleben.<br />Angeln verbindet.</p>
        </div>
      </div>

      <div className="px-3" style={{ paddingBottom: 'calc(100px + env(safe-area-inset-bottom))' }}>
        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          {FILTER_TABS.map((tab) => {
            const Icon = tab.lucide;
            const isActive = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold whitespace-nowrap shrink-0 transition-all ${
                  isActive ? 'text-black' : 'text-white/60 border border-white/15'
                }`}
                style={isActive ? { background: '#00E5FF' } : { background: 'rgba(255,255,255,0.05)' }}
              >
                {tab.icon && <span>{tab.icon}</span>}
                {Icon && <Icon size={11} />}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Event launcher (create event) */}
        {showLauncher && (
          <div className="mb-4">
            <EventLauncher currentUser={currentUser} onStarted={() => { loadData(); setShowLauncher(false); }} />
          </div>
        )}

        {/* Hero event */}
        {heroEvent ? (
          <HeroEventCard event={heroEvent} onNavigate={handleNavigate} />
        ) : (
          <div
            className="rounded-2xl border border-white/8 p-8 text-center mb-3"
            style={{ background: 'rgba(15,30,45,0.75)' }}
          >
            <Trophy size={32} className="text-white/20 mx-auto mb-3" />
            <div className="text-sm text-white/40">Noch keine Events verfügbar</div>
            <button
              type="button"
              onClick={() => setShowLauncher(true)}
              className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold text-black"
              style={{ background: '#00E5FF' }}
            >
              Event erstellen
            </button>
          </div>
        )}

        {/* List events */}
        {listEvents.map((event) => (
          <EventListCard key={event.id} event={event} onNavigate={handleNavigate} />
        ))}

        {competitions.length > 4 && (
          <button
            type="button"
            onClick={() => navigate('/events-catalog')}
            className="w-full py-3 rounded-xl text-sm font-semibold text-cyan-400 border border-cyan-500/20 mb-3"
            style={{ background: 'rgba(0,229,255,0.05)' }}
          >
            Alle Events anzeigen <ChevronRight size={14} className="inline" />
          </button>
        )}

        {/* Create event button */}
        <button
          type="button"
          onClick={() => setShowLauncher(!showLauncher)}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white/70 border border-white/15"
          style={{ background: 'rgba(255,255,255,0.04)' }}
        >
          + Eigenes Event erstellen
        </button>
      </div>
    </div>
  );
}
