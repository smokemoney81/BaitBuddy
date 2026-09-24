import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { auth } from "@/api/auth";
import { api } from "@/api/frontendClient";
import { Link } from "react-router-dom";
import { ChevronRight, Zap, Sparkles, Clock, CalendarDays, Users, Globe, Flag, Fish, Trophy, Hourglass, Star, ArrowRight, UserPlus, MapPin } from "lucide-react";
import { fishImageFor } from "@/lib/fishImages";
import EventLauncher from "@/components/events/EventLauncher";
import PageTitle from "@/components/layout/PageTitle";

function getCountdown(endDate) {
  const now = new Date();
  const end = new Date(endDate);
  const diff = end - now;
  if (diff <= 0) return "Beendet";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

const POINT_RULES = [
  { label: 'Fang eingereicht', points: 100 },
  { label: 'Länge (pro cm)', points: 5 },
  { label: 'Community-Like', points: 1 },
  { label: 'Platz 1', points: 500 },
];

const FILTERS = [
  { id: 'all', label: 'Für dich', icon: Sparkles },
  { id: 'running', label: 'Laufend', icon: Clock },
  { id: 'mine', label: 'Meine Events', icon: CalendarDays },
  { id: 'friends', label: 'Freunde', icon: Users },
  { id: 'community', label: 'Community', icon: Globe },
  { id: 'ended', label: 'Beendet', icon: Flag },
];

const eventTitle = (event) => event.name || event.title || 'Event';
const eventStart = (event) => event.start_date || event.starts_at;
const eventEnd = (event) => event.end_date || event.ends_at;
const isEnded = (event) => {
  const end = eventEnd(event);
  return end ? new Date() > new Date(end) : event.status === 'ended';
};

function formatDay(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}
function formatTime(value) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function EventFacts({ event, participants }) {
  const species = event.target_species;
  const fish = fishImageFor(species);
  return (
    <div className="bb-event-facts">
      <div className="bb-event-fact">
        {fish ? <img src={fish} alt="" loading="lazy" /> : <Fish size={22} aria-hidden="true" />}
        <span><small>Zielarten</small>{species || 'Alle Arten'}</span>
      </div>
      <div className="bb-event-fact">
        <Users size={22} aria-hidden="true" />
        <span><small>Teilnehmer</small>{participants}</span>
      </div>
      <div className="bb-event-fact">
        <Trophy size={22} aria-hidden="true" className="text-amber-300" />
        <span><small>Rewards</small>{event.prize_description || `${event.base_points || 100} Punkte je Fang`}</span>
      </div>
    </div>
  );
}

function EventMeta({ event }) {
  const start = eventStart(event);
  const end = eventEnd(event);
  return (
    <div className="bb-event-meta">
      {start && <span><CalendarDays size={16} aria-hidden="true" />{formatDay(start)}</span>}
      {start && <span><Clock size={16} aria-hidden="true" />{formatTime(start)}</span>}
      {end && !isEnded(event) && <span><Hourglass size={16} aria-hidden="true" />noch {getCountdown(end)}</span>}
      {isEnded(event) && <span><Flag size={16} aria-hidden="true" />Beendet</span>}
    </div>
  );
}

function FeaturedEvent({ event, participants, joined, onJoin }) {
  const fish = fishImageFor(event.target_species);
  return (
    <section className="bb-event-featured" aria-label="Empfohlenes Event">
      <div className="bb-event-featured-media">
        <img src="/assets/buddy/lake-hero.png" alt="" className="bb-event-featured-bg" />
        {fish && <img src={fish} alt="" className="bb-event-featured-fish" />}
        <span className="bb-event-chip is-green"><Star size={14} aria-hidden="true" />Empfohlen für dich</span>
        {event.prize_description && <span className="bb-event-chip is-gold is-right"><Trophy size={14} aria-hidden="true" />Preise</span>}
        <div className="bb-event-featured-text">
          <h2>{eventTitle(event)}</h2>
          <EventMeta event={event} />
        </div>
      </div>
      <div className="bb-event-featured-body">
        <EventFacts event={event} participants={participants} />
        {joined ? (
          <Link to={`/events/${event.id}`} className="bb-action bb-action-block">
            <Trophy size={18} aria-hidden="true" className="bb-action-icon" />
            <span>Zur Rangliste</span>
            <ArrowRight size={18} aria-hidden="true" className="bb-action-arrow" />
          </Link>
        ) : (
          <button type="button" onClick={() => onJoin(event.id)} className="bb-action bb-action-block">
            <UserPlus size={18} aria-hidden="true" className="bb-action-icon" />
            <span>Beitreten</span>
            <ArrowRight size={18} aria-hidden="true" className="bb-action-arrow" />
          </button>
        )}
        <Link to="/TripPlanner?new=1" className="bb-secondary justify-center">
          <MapPin size={16} aria-hidden="true" />Trip zum Event planen
        </Link>
      </div>
    </section>
  );
}

function EventRow({ event, participants, joined }) {
  const fish = fishImageFor(event.target_species);
  const typeLabel = event.visibility === 'friends' ? 'Freunde-Event' : event.event_type === 'template' ? 'Turnier' : 'Community Event';
  return (
    <Link to={`/events/${event.id}`} className="bb-event-row">
      <div className="bb-event-row-media">
        <img src="/assets/buddy/lake-hero.png" alt="" className="bb-event-row-bg" loading="lazy" />
        {fish && <img src={fish} alt="" className="bb-event-row-fish" loading="lazy" />}
        <span className="bb-event-chip is-small">{joined ? 'Dabei' : typeLabel}</span>
      </div>
      <div className="bb-event-row-body">
        <div className="flex items-start justify-between gap-2">
          <h3>{eventTitle(event)}</h3>
          <ChevronRight size={20} aria-hidden="true" className="shrink-0 text-slate-300" />
        </div>
        <EventMeta event={event} />
        <EventFacts event={event} participants={participants} />
      </div>
    </Link>
  );
}

export default function Events() {
  const _navigate = useNavigate();
  const [competitions, setCompetitions] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joined, setJoined] = useState(new Set());
  const [leaderboards, setLeaderboards] = useState({});
  const [pointsSummary, setPointsSummary] = useState({ total_points: 0, participating_events: 0 });
  const [filter, setFilter] = useState('all');

  const loadData = useCallback(async () => {
    try {
      const [comps, user, points] = await Promise.all([
        api.get('/api/events'),
        auth.me().catch(() => null),
        api.get('/api/events/user/current-points').catch(() => null)
      ]);

      setCompetitions(Array.isArray(comps) ? comps : []);
      setCurrentUser(user);
      if (points) setPointsSummary(points);

      if (Array.isArray(comps) && comps.length > 0 && user) {
        const leaderboardsMap = {};
        const joinedSet = new Set();
        await Promise.all(comps.map(async (comp) => {
          const lb = await api.get(`/api/events/${comp.id}/leaderboard`).catch(() => []);
          leaderboardsMap[comp.id] = Array.isArray(lb) ? lb.map((e) => ({
            ...e,
            is_user: e.user_id === user.email
          })) : [];
          const userJoined = (leaderboardsMap[comp.id] || []).some(entry => entry.user_id === user.email);
          if (userJoined) joinedSet.add(comp.id);
        }));
        setLeaderboards(leaderboardsMap);
        setJoined(joinedSet);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleJoin = async (compId) => {
    try {
      await api.post(`/api/events/${compId}/join`, {});
      setJoined(prev => new Set([...prev, compId]));
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 rounded-full"
          style={{ border: '3px solid var(--bb-border)', borderTopColor: 'var(--bb-cyan)' }}
        />
      </div>
    );
  }

  const participantsOf = (event) => (leaderboards[event.id] || []).length;
  const visible = competitions.filter(event => {
    switch (filter) {
      case 'running': return !isEnded(event);
      case 'ended': return isEnded(event);
      case 'mine': return joined.has(event.id) || (currentUser?.email && event.created_by === currentUser.email);
      case 'friends': return event.visibility === 'friends';
      case 'community': return event.visibility !== 'friends';
      default: return true;
    }
  });
  const running = visible.filter(event => !isEnded(event));
  const featured = running.length
    ? [...running].sort((a, b) => participantsOf(b) - participantsOf(a))[0]
    : null;
  const rest = visible.filter(event => event !== featured);

  return (
    <div className="bb-page">
      <PageTitle title="BaitBuddy Events" subtitle="Gemeinsam mehr erleben. Angeln verbindet." />

      <div className="bb-tab-bar" role="tablist" aria-label="Events filtern">
        {FILTERS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={`bb-event-filter${filter === id ? ' is-active' : ''}`}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {featured && (
        <FeaturedEvent
          event={featured}
          participants={participantsOf(featured)}
          joined={joined.has(featured.id)}
          onJoin={handleJoin}
        />
      )}

      {rest.length > 0 && (
        <div className="grid gap-3">
          {rest.map(event => (
            <EventRow key={event.id} event={event} participants={participantsOf(event)} joined={joined.has(event.id)} />
          ))}
        </div>
      )}

      {visible.length === 0 && (
        <div className="bb-card text-center py-8">
          <Trophy size={32} aria-hidden="true" className="mx-auto mb-3 text-slate-400" />
          <p className="text-slate-200 font-semibold">Keine Events in dieser Auswahl</p>
          <p className="bb-muted text-sm mt-1">Starte selbst ein Event aus einer Vorlage – unten.</p>
        </div>
      )}

      {/* Punkte-System */}
      <section className="bb-card" aria-labelledby="points-title">
        <div className="bb-section-head">
          <h2 id="points-title" className="bb-section-title"><Zap size={20} aria-hidden="true" />So sammelst du Punkte</h2>
          <span className="text-sm font-bold text-emerald-300 tabular-nums">{Math.round(pointsSummary.total_points || 0)} Punkte</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {POINT_RULES.map(rule => (
            <div key={rule.label} className="bb-stat-card flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--bb-text-secondary)' }}>{rule.label}</span>
              <span className="font-bold" style={{ color: 'var(--bb-cyan)' }}>+{rule.points}</span>
            </div>
          ))}
        </div>
        {pointsSummary.participating_events > 0 && (
          <p className="text-xs text-slate-400 mt-2">
            Aus {pointsSummary.participating_events} {pointsSummary.participating_events === 1 ? 'Event' : 'Events'}
          </p>
        )}
      </section>

      {/* Event-Auswahl: Vorlage wählen und Event starten */}
      <EventLauncher currentUser={currentUser} onStarted={loadData} />
    </div>
  );
}
