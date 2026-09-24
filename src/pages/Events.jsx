import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { auth } from "@/api/auth";
import { api } from "@/api/frontendClient";
import { ChevronRight, Zap, Award } from "lucide-react";
import EventLauncher from "@/components/events/EventLauncher";

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

const PointsBreakdown = ({ totalPoints, participatingEvents }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6 }}
    className="bb-card mb-8"
  >
    <div className="flex items-center gap-2 mb-6">
      <Zap size={20} style={{ color: 'var(--bb-cyan)' }} />
      <h2 className="text-lg font-bold" style={{ color: 'var(--bb-cyan)' }}>Punkte-System</h2>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[
        { label: "Fang-Einreichung", points: 100, color: "cyan" },
        { label: "Längenbonuson (pro cm)", points: 5, color: "blue" },
        { label: "Community-Likes", points: 1, color: "purple" },
        { label: "Platzierungsbonus (1.)", points: 500, color: "amber" },
      ].map((item, idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.1, duration: 0.4 }}
          className="bb-stat-card"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm" style={{ color: 'var(--bb-text-secondary)' }}>{item.label}</span>
            <span className="font-bold text-lg" style={{ color: 'var(--bb-cyan)' }}>+{item.points}</span>
          </div>
        </motion.div>
      ))}
    </div>

    <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--bb-border)' }}>
      <div className="rounded-xl p-4 flex items-center justify-between" style={{ background: 'rgba(0,0,0,.25)' }}>
        <div className="flex items-center gap-2">
          <Award size={16} style={{ color: '#34d399' }} />
          <span className="text-sm" style={{ color: 'var(--bb-text-secondary)' }}>Deine Gesamtpunkte</span>
        </div>
        <span className="text-2xl font-bold tabular-nums" style={{ color: '#34d399' }}>
          {Math.round(totalPoints || 0)}
        </span>
      </div>
      {participatingEvents > 0 && (
        <p className="text-xs text-gray-500 mt-2">
          Aus {participatingEvents} {participatingEvents === 1 ? "Veranstaltung" : "Veranstaltungen"}
        </p>
      )}
    </div>
  </motion.div>
);

const EventCard = ({ event, isUserJoined, userEntry, onJoin, leaderboard }) => {
  const isEnded = new Date() > new Date(event.end_date);
  const countdown = getCountdown(event.end_date);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      whileHover={{ y: -4 }}
      className="bb-card overflow-hidden"
      style={{ padding: 0 }}
    >
      <div className="px-6 py-4" style={{ background: 'linear-gradient(135deg, rgba(0,229,255,.06), rgba(59,130,246,.06))', borderBottom: '1px solid var(--bb-border)' }}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-white mb-1">{event.name}</h3>
            {event.description && (
              <p className="text-sm text-gray-400">{event.description}</p>
            )}
          </div>
          <motion.span
            animate={{ opacity: [1, 0.6, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
              isEnded
                ? "bg-gray-700/30 text-gray-400 border border-gray-700/50"
                : "bg-green-500/20 text-green-400 border border-green-500/40"
            }`}
          >
            {isEnded ? "Beendet" : "Laufend"}
          </motion.span>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-5">
        <div className="bb-stat-row">
          {[
            { label: 'Zeit', value: countdown, color: 'var(--bb-cyan)' },
            { label: 'Teilnehmer', value: leaderboard.length, color: '#60a5fa' },
            { label: 'Basispunkte', value: event.base_points || 100, color: '#a78bfa' },
          ].map(s => (
            <div key={s.label} className="bb-stat-card">
              <div className="bb-stat-label">{s.label}</div>
              <div className="bb-stat-value" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {isUserJoined && userEntry && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-xl p-4 text-center"
            style={{ background: 'linear-gradient(135deg, rgba(0,229,255,.1), rgba(59,130,246,.1))', border: '1px solid rgba(0,229,255,.3)' }}
          >
            <div className="bb-stat-label" style={{ color: 'var(--bb-cyan)' }}>Deine Punkte</div>
            <div className="text-3xl font-bold" style={{ color: 'var(--bb-cyan)' }}>
              {Math.round(userEntry.total_points || 0)}
            </div>
          </motion.div>
        )}

        {!isUserJoined && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onJoin(event.id)}
            className="bb-action w-full flex items-center justify-center gap-2"
          >
            Beitreten
            <ChevronRight size={16} />
          </motion.button>
        )}

        {/* Leaderboard */}
        {leaderboard.length > 0 && (
          <div className="pt-4" style={{ borderTop: '1px solid var(--bb-border)' }}>
            <h4 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--bb-text-secondary)' }}>
              <Award size={16} style={{ color: '#fbbf24' }} />
              Rangliste (Top 5)
            </h4>
            <div className="grid gap-2">
              {leaderboard.slice(0, 5).map((entry, idx) => {
                const isMe = entry.is_user;
                const rank = idx + 1;
                const rankColors = { 1: '#fbbf24', 2: '#94a3b8', 3: '#fb923c' };
                return (
                  <motion.div
                    key={entry.user_id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex items-center gap-3 p-2.5 rounded-xl"
                    style={{
                      background: isMe ? 'rgba(0,229,255,.08)' : 'rgba(0,0,0,.2)',
                      border: isMe ? '1px solid rgba(0,229,255,.3)' : '1px solid var(--bb-border)',
                    }}
                  >
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(255,255,255,.06)', color: rankColors[rank] || 'var(--bb-muted)' }}>
                      {rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {isMe ? "Du" : entry.user_id.split("@")[0]}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold" style={{ color: 'var(--bb-cyan)' }}>
                        {Math.round(entry.total_points || 0)}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default function Events() {
  const _navigate = useNavigate();
  const [competitions, setCompetitions] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joined, setJoined] = useState(new Set());
  const [leaderboards, setLeaderboards] = useState({});
  const [pointsSummary, setPointsSummary] = useState({ total_points: 0, participating_events: 0 });

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
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bb-bg)' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 rounded-full"
          style={{ border: '3px solid var(--bb-border)', borderTopColor: 'var(--bb-cyan)' }}
        />
      </div>
    );
  }

  return (
    <div className="bb-page">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-4"
      >
        <h1 className="text-3xl font-bold text-white mb-2">Veranstaltungen</h1>
        <p style={{ color: 'var(--bb-muted)' }}>Nimm an Wettbewerben teil und sammle Punkte</p>
      </motion.div>

      {/* Points System */}
      <PointsBreakdown
        totalPoints={pointsSummary.total_points}
        participatingEvents={pointsSummary.participating_events}
      />

      {/* Event-Auswahl: Vorlage wählen und Event starten */}
      <div className="mb-8">
        <EventLauncher currentUser={currentUser} onStarted={loadData} />
      </div>

      {/* Events */}
      {competitions.length > 0 ? (
        <div className="grid gap-6">
          {competitions.map((event, _idx) => (
            <EventCard
              key={event.id}
              event={event}
              isUserJoined={joined.has(event.id)}
              userEntry={(leaderboards[event.id] || []).find(e => e.user_id === currentUser?.email)}
              onJoin={handleJoin}
              leaderboard={leaderboards[event.id] || []}
            />
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--bb-surface)' }}>
            <Zap size={32} style={{ color: 'var(--bb-muted)' }} />
          </div>
          <p style={{ color: 'var(--bb-muted)' }} className="text-lg">Keine aktiven Veranstaltungen</p>
          <p className="text-sm mt-1" style={{ color: 'var(--bb-muted)', opacity: 0.7 }}>Komm später zurück für neue Wettbewerbe</p>
        </motion.div>
      )}
    </div>
  );
}
