import React, { useEffect, useMemo, useState } from "react";
import { entities } from "@/api/frontendClient";
import { auth } from "@/api/auth";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Loader2 } from "lucide-react";

export default function AdminTracking() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [range, setRange] = useState(7);

  useEffect(() => {
    (async () => {
      try {
        const me = await auth.me();
        setUser(me);
        if (me?.role !== "admin") {
          setLoading(false);
          return;
        }
        const [evts, sess] = await Promise.all([
          entities.TrackingEvent.list("-created_date", 5000),
          entities.UsageSession.list("-created_date", 5000),
        ]);
        setEvents(evts || []);
        setSessions(sess || []);
      } catch (e) {
        // ignore
      }
      setLoading(false);
    })();
  }, []);

  const cutoff = useMemo(() => Date.now() - range * 24 * 60 * 60 * 1000, [range]);

  const filteredEvents = useMemo(
    () => events.filter((e) => new Date(e.created_date).getTime() >= cutoff),
    [events, cutoff]
  );
  const filteredSessions = useMemo(
    () => sessions.filter((s) => new Date(s.created_date).getTime() >= cutoff),
    [sessions, cutoff]
  );

  const pageViews = useMemo(() => {
    const map = {};
    filteredEvents
      .filter((e) => e.event_type === "page_view" && e.page_name)
      .forEach((e) => {
        map[e.page_name] = (map[e.page_name] || 0) + 1;
      });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [filteredEvents]);

  const featureClicks = useMemo(() => {
    const map = {};
    filteredEvents
      .filter((e) => e.event_type === "feature_click" && e.feature_id)
      .forEach((e) => {
        map[e.feature_id] = (map[e.feature_id] || 0) + 1;
      });
    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }, [filteredEvents]);

  const userSessions = useMemo(() => {
    const map = {};
    filteredSessions
      .filter((s) => s.feature_id === "app_general" && s.started_at)
      .forEach((s) => {
        const start = new Date(s.started_at).getTime();
        const end = s.stopped_at
          ? new Date(s.stopped_at).getTime()
          : new Date(s.last_heartbeat || s.started_at).getTime();
        const minutes = Math.max(0, Math.round((end - start) / 60000));
        if (!map[s.user_id]) map[s.user_id] = { user: s.user_id, minutes: 0, count: 0 };
        map[s.user_id].minutes += minutes;
        map[s.user_id].count += 1;
      });
    return Object.values(map).sort((a, b) => b.minutes - a.minutes).slice(0, 30);
  }, [filteredSessions]);

  const totalPageViews = filteredEvents.filter((e) => e.event_type === "page_view").length;
  const totalClicks = filteredEvents.filter((e) => e.event_type === "feature_click").length;
  const uniqueUsers = new Set(filteredEvents.map((e) => e.user_id)).size;
  const totalMinutes = userSessions.reduce((s, u) => s + u.minutes, 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bb-bg)' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--bb-cyan)' }} />
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="bb-page text-center">
        <h1 className="text-2xl font-bold text-white mb-2">Zugriff verweigert</h1>
        <p style={{ color: 'var(--bb-muted)' }}>Diese Seite ist nur fuer Administratoren verfuegbar.</p>
      </div>
    );
  }

  return (
    <div className="bb-page">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Tracking Auswertung</h1>
          <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>Nutzungsdaten der letzten {range} Tage</p>
        </div>
        <div className="flex gap-2">
          {[1, 7, 30, 90].map((d) => (
            <button type="button"
              key={d}
              onClick={() => setRange(d)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                range === d ? "bb-action" : ""
              }`}
              style={range !== d ? { background: 'var(--bb-surface)', color: 'var(--bb-muted)', border: '1px solid var(--bb-border)' } : undefined}
            >
              {d === 1 ? "Heute" : `${d} Tage`}
            </button>
          ))}
        </div>
      </div>

      <div className="bb-stat-row" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        {[
          { label: 'Seitenaufrufe', value: totalPageViews },
          { label: 'Feature-Klicks', value: totalClicks },
          { label: 'Aktive Nutzer', value: uniqueUsers },
          { label: 'Gesamt-Minuten', value: totalMinutes },
        ].map(s => (
          <div key={s.label} className="bb-stat-card">
            <div className="bb-stat-label">{s.label}</div>
            <div className="bb-stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="bb-card">
        <div className="font-bold text-white mb-4">Seitenaufrufe (Top 20)</div>
        {pageViews.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>Keine Daten</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, pageViews.length * 28)}>
            <BarChart data={pageViews} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bb-border)" />
              <XAxis type="number" stroke="var(--bb-muted)" />
              <YAxis type="category" dataKey="name" stroke="var(--bb-muted)" width={120} />
              <Tooltip contentStyle={{ background: 'var(--bb-surface)', border: '1px solid var(--bb-border)' }} />
              <Bar dataKey="count" fill="#00E5FF" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bb-card">
        <div className="font-bold text-white mb-4">Feature-Nutzung (Top 20)</div>
        {featureClicks.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>Keine Daten</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, featureClicks.length * 28)}>
            <BarChart data={featureClicks} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--bb-border)" />
              <XAxis type="number" stroke="var(--bb-muted)" />
              <YAxis type="category" dataKey="name" stroke="var(--bb-muted)" width={120} />
              <Tooltip contentStyle={{ background: 'var(--bb-surface)', border: '1px solid var(--bb-border)' }} />
              <Bar dataKey="count" fill="#fbbf24" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bb-card">
        <div className="font-bold text-white mb-4">Sitzungsdauer pro Nutzer</div>
        {userSessions.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>Keine Daten</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: 'var(--bb-muted)', borderBottom: '1px solid var(--bb-border)' }}>
                  <th className="py-2 pr-4">Nutzer</th>
                  <th className="py-2 pr-4 text-right">Sitzungen</th>
                  <th className="py-2 text-right">Minuten gesamt</th>
                </tr>
              </thead>
              <tbody>
                {userSessions.map((u) => (
                  <tr key={u.user} style={{ borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                    <td className="py-2 pr-4 text-white">{u.user}</td>
                    <td className="py-2 pr-4 text-right" style={{ color: 'var(--bb-muted)' }}>{u.count}</td>
                    <td className="py-2 text-right font-medium" style={{ color: 'var(--bb-cyan)' }}>{u.minutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
