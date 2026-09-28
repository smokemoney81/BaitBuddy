import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Trophy, ChevronRight } from "lucide-react";
import { events } from "@/api/frontendClient";
import { auth } from "@/api/auth";

const REFRESH_MS = 5 * 60 * 1000;

// Restzeit als „2T 04:12:09“ bzw. „04:12:09“ unter einem Tag.
export function formatRemaining(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const clock = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return days > 0 ? `${days}T ${clock}` : clock;
}

// Countdown bis zum Ende des laufenden Events (das als nächstes endet) samt
// Event-Namen. Die Restzeit wird jede Sekunde aus end_date neu berechnet —
// kein hochzählender Zähler, der nach Hintergrund/Standby falsch läuft.
function EventTimer() {
  const [event, setEvent] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (!(await auth.isAuthenticated())) return;
        const res = await events.getActiveEvent();
        if (!cancelled) setEvent(res?.active_event?.end_date ? res.active_event : null);
      } catch {
        // Kein Timer ist besser als ein falscher — still ausblenden.
        if (!cancelled) setEvent(null);
      }
    };
    load();
    const refresh = setInterval(load, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!event) return undefined;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [event]);

  if (!event) return null;
  const remaining = new Date(event.end_date).getTime() - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return null;

  const name = event.name || "Event";
  const time = formatRemaining(remaining);

  return (
    <Link
      to={`/events/${event.id}`}
      className="bb-event-timer"
      aria-label={`Event ${name} endet in ${time}`}
      title={`${name} – endet am ${new Date(event.end_date).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}`}
    >
      <Trophy size={18} aria-hidden="true" />
      <span className="bb-event-timer-name">{name}</span>
      <span className="bb-event-timer-time">· endet in {time}</span>
      <ChevronRight size={18} aria-hidden="true" className="bb-event-timer-chevron" />
    </Link>
  );
}

export default React.memo(EventTimer);
