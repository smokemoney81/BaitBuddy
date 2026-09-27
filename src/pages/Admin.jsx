import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  BarChart3, MessageSquare, Trophy, LifeBuoy, Mail, Trash2, RotateCcw, Loader2, ShieldAlert, Send, Users, Crown, Fish, Search,
  SlidersHorizontal, Coins,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import PageTitle from "@/components/layout/PageTitle";
import { auth } from "@/api/auth";
import { superAdmin } from "@/api/frontendClient";
import { TOOLS } from "@/lib/toolRegistry";
import { publishAppSettings } from "@/lib/appSettings";

// Admin-Bereich des Superusers. Die Oberfläche blendet sich für alle anderen
// aus; die eigentliche Sperre sitzt serverseitig (requireSuperuser).

const TICKET_STATUS = [
  ["offen", "Offen"],
  ["in_bearbeitung", "In Bearbeitung"],
  ["geloest", "Gelöst"],
  ["geschlossen", "Geschlossen"],
];
const NON_TOOL_CATEGORIES = new Set(["settings", "legal"]);

// Route-Segment -> Tool. Einstellungs-/Rechtsseiten zählen nicht, ebenso
// Tools hinter einem Query-Reiter (z. B. /Settings?tab=general): Seitenaufrufe
// erfassen nur den Pfad, so ein Tool wäre nicht von seiner Seite zu trennen.
const TOOL_BY_PAGE = (() => {
  const map = new Map();
  for (const tool of TOOLS) {
    if (NON_TOOL_CATEGORIES.has(tool.category) || tool.route.includes("?")) continue;
    const page = tool.route.replace(/^\//, "").split("/")[0];
    if (page && !map.has(page)) map.set(page, tool);
  }
  return map;
})();

function formatDate(value) {
  if (!value) return "–";
  return new Date(value).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function errorText(e, fallback) {
  return e?.data?.error || e?.message || fallback;
}

function Empty({ children }) {
  return <p className="text-center py-6 bb-muted">{children}</p>;
}

function Busy() {
  return (
    <div className="flex items-center justify-center py-8" style={{ color: "var(--bb-cyan)" }}>
      <Loader2 size={20} className="animate-spin mr-2" aria-hidden="true" /> Lade …
    </div>
  );
}

// ── Statistik ──────────────────────────────────────────────────────────────
// Nur echte Daten aus /api/superadmin/stats. Konnte der Server eine Zahl nicht
// ermitteln, kommt null — angezeigt als „unbekannt“, nie als erfundene 0.

// Feature-IDs aus useFeatureTracking (usage_sessions.feature_id) -> Anzeige.
// tool:false = keine Angel-Funktion (Einstellungen, Profil …), zählt nicht zu den Top 10.
const FEATURES = {
  ai_buddy: { name: "KI-Buddy", route: "/KiBuddyBeta" },
  map: { name: "Karte", route: "/Map" },
  catch_log: { name: "Fangbuch", route: "/Logbook" },
  fishing_plan: { name: "Trip-Planer", route: "/TripPlanner" },
  community: { name: "Community", route: "/Community" },
  geraete: { name: "Geräte", route: "/Devices" },
  bait_recipe: { name: "Köder-Mixer", route: "/BaitMixer" },
  water_analysis: { name: "Gewässeranalyse", route: "/WaterAnalysis" },
  angelschein_pruefung: { name: "Prüfung & Schonzeiten", route: "/AngelscheinPruefungSchonzeiten" },
  lizenzen: { name: "Lizenzen", route: "/Licenses" },
  leaderboard: { name: "Ranglisten", route: "/Rank" },
  bite_detector: { name: "Fischbestimmung & Biss", route: "/AI" },
  lure_3d: { name: "3D-Köderführung", route: "/Koeder3D" },
  gear_market: { name: "Gebrauchtmarkt", route: "/UsedGear" },
  gear_recognition: { name: "Ausrüstung erkennen", route: "/GearRecognition" },
  gear_maintenance: { name: "Wartung", route: "/GearMaintenance" },
  satellite_analysis: { name: "Satellitenanalyse", route: "/SatelliteAnalysis" },
  rule_assistant: { name: "Regel-Assistent", route: "/RuleAssistant" },
  offline_fishing_pack: { name: "Offline-Paket", route: "/OfflineFishingPack" },
  fish_recipes: { name: "Fischrezepte", route: "/FishRecipes" },
  events: { name: "Event-Katalog", route: "/events-catalog" },
  event_details: { name: "Event-Details", route: "/Events" },
  monthly_leaderboard: { name: "Monatsrangliste", route: "/leaderboards/monthly" },
  voice_lecture: { name: "Sprach-Lektionen", route: "/VoiceLecture" },
  einstellungen: { name: "Einstellungen", route: "/Settings", tool: false },
  profil: { name: "Profil", route: "/Profile", tool: false },
  notification_center: { name: "Benachrichtigungen", route: "/NotificationCenter", tool: false },
  premium: { name: "Premium", route: "/PremiumPlans", tool: false },
};

const PLAN_LABELS = {
  free: "Kostenlos", basic: "Basic", pro: "Pro", elite: "Ultimate", ultimate: "Ultimate",
  friends: "Friends", friends_monthly: "Friends (Monat)", trial_10_10: "10-Tage-Pass",
};

const fmt = (n) => (typeof n === "number" ? n.toLocaleString("de-DE") : "unbekannt");

function formatMinutes(min) {
  if (typeof min !== "number") return "unbekannt";
  if (min < 60) return `${min} Min.`;
  const h = min / 60;
  return `${h.toLocaleString("de-DE", { maximumFractionDigits: h < 10 ? 1 : 0 })} Std.`;
}

function Kpi({ label, value, detail }) {
  return (
    <div className="bb-admin-kpi">
      <span className="bb-admin-kpi-label">{label}</span>
      <strong className="bb-admin-kpi-value">{value}</strong>
      {detail && <span className="bb-admin-kpi-detail">{detail}</span>}
    </div>
  );
}

function BarList({ rows, valueKey, render }) {
  const max = Math.max(1, ...rows.map(r => r[valueKey] || 0));
  return (
    <ol className="bb-admin-bars">
      {rows.map((row, i) => {
        const { label, href, value, detail, title } = render(row);
        return (
          <li key={label + i} title={title}>
            <span className="bb-admin-bar-rank">{i + 1}</span>
            <span className="bb-admin-bar-label">
              {href ? <Link to={href}>{label}</Link> : <span className="bb-admin-bar-name">{label}</span>}
              <span className="bb-admin-bar-track" aria-hidden="true">
                <span className="bb-admin-bar-fill" style={{ width: `${Math.max(2, ((row[valueKey] || 0) / max) * 100)}%` }} />
              </span>
            </span>
            <span className="bb-admin-bar-value">{value}{detail && <small>{detail}</small>}</span>
          </li>
        );
      })}
    </ol>
  );
}

function DailyChart({ daily }) {
  const max = Math.max(1, ...daily.map(d => d.users));
  const label = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  return (
    <figure className="bb-admin-daily">
      <div className="bb-admin-daily-plot" role="img" aria-label={`Aktive Nutzer pro Tag, höchstens ${max}`}>
        {daily.map(d => (
          <span key={d.date} className="bb-admin-daily-col" title={`${label(d.date)}: ${d.users} aktive Nutzer, ${d.sessions} App-Sitzungen`}>
            <span className="bb-admin-daily-bar" style={{ height: `${d.users ? Math.max(4, (d.users / max) * 100) : 0}%` }} />
          </span>
        ))}
      </div>
      <figcaption className="bb-admin-daily-axis">
        <span>{label(daily[0].date)}</span>
        <span>max. {max} am Tag</span>
        <span>{label(daily[daily.length - 1].date)}</span>
      </figcaption>
    </figure>
  );
}

function StatsSection({ title, icon: Icon, children }) {
  return (
    <section className="bb-card">
      <h2 className="bb-section-title mb-3">{Icon && <Icon size={20} aria-hidden="true" />}{title}</h2>
      {children}
    </section>
  );
}

function Statistics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    superAdmin.stats(days)
      .then(res => { if (!cancelled) setData(res); })
      .catch(e => { if (!cancelled) setError(errorText(e, "Statistik konnte nicht geladen werden")); });
    return () => { cancelled = true; };
  }, [days]);

  const tools = useMemo(() => (data?.usage?.features || [])
    .filter(f => FEATURES[f.feature]?.tool !== false)
    .slice(0, 10), [data]);
  const plans = useMemo(() => Object.entries(data?.users?.plans || {})
    .map(([plan, count]) => ({ plan, count }))
    .sort((a, b) => b.count - a.count), [data]);

  const users = data?.users;
  const usage = data?.usage;
  const content = data?.content || {};

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm bb-muted">Zeitraum</p>
        <div className="flex gap-1" role="group" aria-label="Zeitraum">
          {[7, 30, 90].map(d => (
            <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d}
              className={`bb-admin-range${days === d ? " is-active" : ""}`}>
              {d} Tage
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="bb-card"><Empty>{error}</Empty></div> : !data ? <div className="bb-card"><Busy /></div> : (
        <>
          <div className="bb-admin-kpis">
            <Kpi label="Nutzer gesamt" value={fmt(users?.total)} detail={users ? `+${fmt(users.new_period)} neu in ${days} Tagen` : "unbekannt"} />
            <Kpi label={`Aktiv (${days} Tage)`} value={fmt(users?.active_period)} detail={users ? `${fmt(users.active_7d)} in den letzten 7 Tagen` : null} />
            <Kpi label="App-Sitzungen" value={fmt(usage?.app_sessions)} detail={usage ? `${formatMinutes(usage.app_minutes)} Nutzung` : null} />
            <Kpi label="Offene Tickets" value={fmt(content.tickets_open)} detail={`von ${fmt(content.tickets_total)} insgesamt`} />
          </div>

          <StatsSection title="Aktive Nutzer pro Tag" icon={Users}>
            {usage?.daily?.length ? <DailyChart daily={usage.daily} /> : <Empty>Keine Nutzungsdaten verfügbar.</Empty>}
          </StatsSection>

          <StatsSection title="Top 10 Tools" icon={BarChart3}>
            {!usage ? <Empty>Nutzungsdaten konnten nicht geladen werden.</Empty> : tools.length === 0 ? (
              <Empty>Im Zeitraum wurde kein Tool genutzt.</Empty>
            ) : (
              <BarList rows={tools} valueKey="sessions" render={f => {
                const meta = FEATURES[f.feature];
                return {
                  label: meta?.name || f.feature,
                  href: meta?.route,
                  value: fmt(f.sessions),
                  detail: `${f.users} Nutzer · ${formatMinutes(f.minutes)}`,
                  title: `${meta?.name || f.feature}: ${f.sessions} Sitzungen von ${f.users} Nutzern, ${formatMinutes(f.minutes)} Nutzungsdauer`,
                };
              }} />
            )}
            <p className="text-xs bb-muted mt-3">Gezählt werden Sitzungen: jedes Öffnen eines Tools durch einen angemeldeten Nutzer.</p>
          </StatsSection>

          <StatsSection title="Tarife" icon={Crown}>
            {!users ? <Empty>Nutzerdaten konnten nicht geladen werden.</Empty> : (
              <BarList rows={plans} valueKey="count" render={p => ({
                label: PLAN_LABELS[p.plan] || p.plan,
                value: fmt(p.count),
                detail: users.total ? `${Math.round((p.count / users.total) * 100)} %` : null,
                title: `${PLAN_LABELS[p.plan] || p.plan}: ${p.count} Nutzer`,
              })} />
            )}
            {users && <p className="text-xs bb-muted mt-3">{fmt(users.never_signed_in)} Konten haben sich nie angemeldet.</p>}
          </StatsSection>

          <StatsSection title="Inhalte" icon={Fish}>
            <dl className="bb-admin-content">
              {[
                ["Fänge", content.catches_total, `${fmt(content.catches_period)} in ${days} Tagen`],
                ["Spots", content.spots],
                ["Trip-Pläne", content.fishing_plans],
                ["Gewässeranalysen", content.water_analyses],
                ["Community-Beiträge", content.community_posts],
                ["Kommentare", content.community_comments],
                ["Laufende Events", content.events_running],
                ["Archivierte Events", content.events_archived],
                ["Event-Teilnahmen", content.event_participants],
              ].map(([label, value, detail]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{fmt(value)}{detail && <small>{detail}</small>}</dd>
                </div>
              ))}
            </dl>
          </StatsSection>

          {usage?.pages?.length > 0 && (
            <StatsSection title="Meistbesuchte Seiten" icon={BarChart3}>
              <BarList rows={usage.pages.slice(0, 10)} valueKey="views" render={p => {
                const tool = TOOL_BY_PAGE.get(p.page);
                return {
                  label: tool?.name || p.page,
                  href: `/${p.page}`,
                  value: fmt(p.views),
                  detail: `${p.users} Nutzer`,
                  title: `${tool?.name || p.page}: ${p.views} Aufrufe von ${p.users} Nutzern`,
                };
              }} />
            </StatsSection>
          )}

          <p className="text-xs bb-muted text-center">Stand: {formatDate(data.generated_at)}</p>
        </>
      )}
    </div>
  );
}

// ── Community ──────────────────────────────────────────────────────────────
function CommunityAdmin() {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    superAdmin.communityPosts()
      .then(list => setPosts(Array.isArray(list) ? list : []))
      .catch(e => setError(errorText(e, "Beiträge konnten nicht geladen werden")));
  }, []);
  useEffect(load, [load]);

  const remove = async (post) => {
    if (!window.confirm("Diesen Community-Beitrag samt Kommentaren endgültig löschen?")) return;
    try {
      await superAdmin.deletePost(post.id);
      setPosts(list => list.filter(p => p.id !== post.id));
      toast.success("Beitrag gelöscht");
    } catch (e) {
      toast.error(errorText(e, "Löschen fehlgeschlagen"));
    }
  };

  return (
    <section className="bb-card">
      <h2 className="bb-section-title mb-3"><MessageSquare size={20} aria-hidden="true" />Community-Einträge</h2>
      {error ? <Empty>{error}</Empty> : !posts ? <Busy /> : posts.length === 0 ? <Empty>Keine Beiträge vorhanden.</Empty> : (
        <ul className="grid gap-2">
          {posts.map(post => (
            <li key={post.id} className="bb-admin-item">
              <div className="min-w-0 flex-1">
                <p className="text-xs bb-muted">{post.created_by || "unbekannt"} · {formatDate(post.created_at)}{post.reported ? " · gemeldet" : ""}</p>
                <p className="text-sm text-slate-100 whitespace-pre-wrap break-words">{post.text || (post.photo_url ? "(nur Foto)" : "(leer)")}</p>
              </div>
              <button type="button" className="bb-admin-icon-btn is-danger" onClick={() => remove(post)} aria-label="Beitrag löschen">
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Events ─────────────────────────────────────────────────────────────────
function eventState(event) {
  if (event.status === "active" && event.end_date && new Date(event.end_date) > new Date()) return "läuft";
  if (event.is_active === false) return "archiviert";
  return "beendet";
}

function EventsAdmin() {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setError("");
    superAdmin.events()
      .then(res => setList(Array.isArray(res) ? res : []))
      .catch(e => setError(errorText(e, "Events konnten nicht geladen werden")));
  }, []);
  useEffect(load, [load]);

  const remove = async (event) => {
    if (!window.confirm(`Event „${event.name || "Event"}“ löschen? Es verschwindet aus Liste und Archiv.`)) return;
    setBusyId(event.id);
    try {
      await superAdmin.deleteEvent(event.id);
      setList(l => l.filter(e => e.id !== event.id));
      toast.success("Event gelöscht");
    } catch (e) {
      toast.error(errorText(e, "Löschen fehlgeschlagen"));
    }
    setBusyId(null);
  };

  const restart = async (event) => {
    if (!window.confirm(`Event „${event.name || "Event"}“ ab jetzt mit gleicher Laufzeit neu starten?`)) return;
    setBusyId(event.id);
    try {
      const created = await superAdmin.restartEvent(event.id);
      setList(l => [created, ...l]);
      toast.success("Event neu gestartet");
    } catch (e) {
      toast.error(errorText(e, "Neustart fehlgeschlagen"));
    }
    setBusyId(null);
  };

  return (
    <section className="bb-card">
      <h2 className="bb-section-title mb-3"><Trophy size={20} aria-hidden="true" />Events</h2>
      {error ? <Empty>{error}</Empty> : !list ? <Busy /> : list.length === 0 ? <Empty>Keine Events vorhanden.</Empty> : (
        <ul className="grid gap-2">
          {list.map(event => (
            <li key={event.id} className="bb-admin-item">
              <div className="min-w-0 flex-1">
                <Link to={`/events/${event.id}`} className="text-sm font-semibold text-slate-100 break-words">{event.name || event.title || "Event"}</Link>
                <p className="text-xs bb-muted">
                  {eventState(event)} · {formatDate(event.start_date)} – {formatDate(event.end_date)} · {event.created_by || "–"}
                </p>
              </div>
              <button type="button" className="bb-admin-icon-btn" onClick={() => restart(event)} disabled={busyId === event.id} aria-label="Event neu starten">
                <RotateCcw size={18} aria-hidden="true" />
              </button>
              <button type="button" className="bb-admin-icon-btn is-danger" onClick={() => remove(event)} disabled={busyId === event.id} aria-label="Event löschen">
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Tickets ────────────────────────────────────────────────────────────────
function TicketCard({ ticket, onChange, onDelete }) {
  const [status, setStatus] = useState(ticket.status || "offen");
  const [reply, setReply] = useState(ticket.admin_response || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const patch = { status };
      if (reply.trim() !== (ticket.admin_response || "").trim()) patch.admin_response = reply;
      const res = await superAdmin.updateTicket(ticket.id, patch);
      onChange(res.ticket);
      if (patch.admin_response && res.emailed) toast.success("Gespeichert – Antwort per E-Mail verschickt");
      else if (patch.admin_response && res.email_error) toast.warning(`Gespeichert, E-Mail nicht verschickt: ${res.email_error}`);
      else toast.success("Gespeichert");
    } catch (e) {
      toast.error(errorText(e, "Speichern fehlgeschlagen"));
    }
    setSaving(false);
  };

  return (
    <li className="bb-admin-ticket">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-100 break-words">{ticket.subject}</h3>
          <p className="text-xs bb-muted">
            {ticket.user_name} · <a href={`mailto:${ticket.user_email}`} className="underline">{ticket.user_email}</a> · {ticket.category} · {formatDate(ticket.created_date)}
          </p>
        </div>
        <button type="button" className="bb-admin-icon-btn is-danger" onClick={() => onDelete(ticket)} aria-label="Ticket löschen">
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{ticket.message}</p>
      <label className="text-xs text-slate-300" htmlFor={`reply-${ticket.id}`}>Antwort (geht per E-Mail an den Nutzer und erscheint unter „Meine Tickets“)</label>
      <Textarea
        id={`reply-${ticket.id}`}
        value={reply}
        onChange={e => setReply(e.target.value)}
        placeholder="Antwort schreiben …"
        className="bg-gray-800/50 border-gray-700 text-white min-h-[90px]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="bb-admin-select"
          aria-label="Status"
        >
          {TICKET_STATUS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="button" className="bb-action flex-1" onClick={save} disabled={saving}>
          {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
          Speichern
        </button>
      </div>
    </li>
  );
}

function TicketsAdmin() {
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("open");

  const load = useCallback(() => {
    setError("");
    superAdmin.tickets()
      .then(list => setTickets(Array.isArray(list) ? list : []))
      .catch(e => setError(errorText(e, "Tickets konnten nicht geladen werden")));
  }, []);
  useEffect(load, [load]);

  const remove = async (ticket) => {
    if (!window.confirm(`Ticket „${ticket.subject}“ endgültig löschen?`)) return;
    try {
      await superAdmin.deleteTicket(ticket.id);
      setTickets(list => list.filter(t => t.id !== ticket.id));
      toast.success("Ticket gelöscht");
    } catch (e) {
      toast.error(errorText(e, "Löschen fehlgeschlagen"));
    }
  };
  const update = (next) => setTickets(list => list.map(t => (t.id === next.id ? next : t)));

  const shown = (tickets || []).filter(t => filter === "all" || t.status === "offen" || t.status === "in_bearbeitung");

  return (
    <section className="bb-card">
      <div className="bb-section-head">
        <h2 className="bb-section-title"><LifeBuoy size={20} aria-hidden="true" />Support-Tickets</h2>
        <div className="flex gap-1" role="group" aria-label="Tickets filtern">
          <button type="button" className={`bb-admin-range${filter === "open" ? " is-active" : ""}`} aria-pressed={filter === "open"} onClick={() => setFilter("open")}>Offen</button>
          <button type="button" className={`bb-admin-range${filter === "all" ? " is-active" : ""}`} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Alle</button>
        </div>
      </div>
      {error ? <Empty>{error}</Empty> : !tickets ? <Busy /> : shown.length === 0 ? <Empty>Keine Tickets in dieser Auswahl.</Empty> : (
        <ul className="grid gap-3">
          {shown.map(ticket => <TicketCard key={ticket.id} ticket={ticket} onChange={update} onDelete={remove} />)}
        </ul>
      )}
    </section>
  );
}

// ── Nutzer & Pläne ─────────────────────────────────────────────────────────
// Alle Konten aus /api/superadmin/users. „Plan" ist der Plan, der gerade gilt
// (Abo, Testphase oder Pass); weicht das gespeicherte Abo davon ab, steht es
// daneben — sonst wäre nicht zu erkennen, warum eine Zuweisung scheinbar nicht
// greift (ein laufender Pass/Trial überdeckt ein kleineres Abo).
const ASSIGN_PLANS = ["basic", "pro", "elite", "friends_monthly", "friends"];
const ASSIGN_DAYS = [7, 30, 90, 180, 365];
const USERS_PAGE = 50;
const PROVIDER_LABELS = { email: "E-Mail", google: "Google", apple: "Apple" };
const PLAN_SOURCE = { subscription: "", trial: "Testphase", premium_pass: "Pass" };

function planText(plan) {
  const label = PLAN_LABELS[plan.id] || plan.id;
  if (plan.id === "free") return label;
  const source = PLAN_SOURCE[plan.source];
  const until = plan.expires_at ? `bis ${formatDate(plan.expires_at)}` : "ohne Ablauf";
  return [label, source, until].filter(Boolean).join(" · ");
}

function PlanAssign({ user, onAssigned }) {
  const [planId, setPlanId] = useState(ASSIGN_PLANS.includes(user.subscription.id) ? user.subscription.id : "basic");
  const [days, setDays] = useState(30);
  const [saving, setSaving] = useState(false);
  const revoke = planId === "free";

  const save = async () => {
    const who = user.email || user.full_name;
    const question = revoke
      ? `Abo von ${who} entziehen? Ein laufender Pass oder eine Testphase bleibt bestehen.`
      : `${PLAN_LABELS[planId]} für ${days} Tage an ${who} vergeben? Die Laufzeit beginnt jetzt.`;
    if (!window.confirm(question)) return;
    setSaving(true);
    try {
      const res = await superAdmin.assignPlan(user.id, planId, days);
      onAssigned(res.user);
      toast.success(revoke ? "Abo entzogen" : `${PLAN_LABELS[planId]} vergeben`);
    } catch (e) {
      toast.error(errorText(e, "Zuweisung fehlgeschlagen"));
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0">
      <select value={planId} onChange={e => setPlanId(e.target.value)} className="bb-admin-select flex-1 min-w-0 basis-36" aria-label="Plan">
        {ASSIGN_PLANS.map(id => <option key={id} value={id}>{PLAN_LABELS[id]}</option>)}
        <option value="free">Abo entziehen</option>
      </select>
      <select value={days} onChange={e => setDays(Number(e.target.value))} className="bb-admin-select" aria-label="Laufzeit" disabled={revoke}>
        {ASSIGN_DAYS.map(d => <option key={d} value={d}>{d} Tage</option>)}
      </select>
      <button type="button" className="bb-action" onClick={save} disabled={saving}>
        {saving ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Crown size={16} aria-hidden="true" />}
        Speichern
      </button>
    </div>
  );
}

function UserRow({ user, onAssigned }) {
  const [open, setOpen] = useState(false);
  const providers = user.providers.map(p => PROVIDER_LABELS[p] || p).join(", ") || "unbekannt";
  const subscriptionDiffers = user.subscription.id !== "free" && user.subscription.id !== user.plan.id;

  return (
    <li className="bb-admin-ticket min-w-0">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-100 break-all">{user.full_name || user.email}</h3>
          {user.full_name && <p className="text-xs bb-muted break-all">{user.email}</p>}
        </div>
        <span className={`shrink-0 text-xs font-semibold${user.plan.id === "free" ? " bb-muted" : ""}`} style={user.plan.id === "free" ? undefined : { color: "var(--bb-cyan)" }}>
          {PLAN_LABELS[user.plan.id] || user.plan.id}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs [&>dd]:break-words">
        <dt className="bb-muted">Letzter Login</dt><dd className="text-slate-200">{user.last_sign_in_at ? formatDate(user.last_sign_in_at) : "noch nie"}</dd>
        <dt className="bb-muted">Registriert</dt><dd className="text-slate-200">{formatDate(user.created_at)}{user.email_confirmed ? "" : " · E-Mail unbestätigt"}</dd>
        <dt className="bb-muted">Anmeldung über</dt><dd className="text-slate-200">{providers}</dd>
        <dt className="bb-muted">Plan</dt><dd className="text-slate-200">{planText(user.plan)}</dd>
        {subscriptionDiffers && (
          <><dt className="bb-muted">Abo</dt><dd className="text-slate-200">{planText({ ...user.subscription, source: "subscription" })}</dd></>
        )}
        {user.subscription.payment_method === "admin" && user.subscription.assigned_by && (
          <><dt className="bb-muted">Vergeben von</dt><dd className="text-slate-200 break-all">{user.subscription.assigned_by}</dd></>
        )}
      </dl>
      {open ? (
        <PlanAssign user={user} onAssigned={(next) => { onAssigned(next); setOpen(false); }} />
      ) : (
        <button type="button" className="bb-admin-range self-start" onClick={() => setOpen(true)}>Plan zuweisen</button>
      )}
    </li>
  );
}

function UsersAdmin() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [visible, setVisible] = useState(USERS_PAGE);

  useEffect(() => {
    superAdmin.users()
      .then(res => setData(Array.isArray(res?.users) ? res.users : []))
      .catch(e => setError(errorText(e, "Nutzer konnten nicht geladen werden")));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data || []).filter(u => {
      if (filter === "paid" && u.plan.id === "free") return false;
      if (filter === "free" && u.plan.id !== "free") return false;
      return !q || u.email.toLowerCase().includes(q) || u.full_name.toLowerCase().includes(q);
    });
  }, [data, query, filter]);

  useEffect(() => { setVisible(USERS_PAGE); }, [query, filter]);

  const replace = (next) => setData(list => list.map(u => (u.id === next.id ? next : u)));
  const filters = [["all", "Alle"], ["paid", "Mit Plan"], ["free", "Kostenlos"]];

  return (
    <section className="bb-card">
      <div className="bb-section-head">
        <h2 className="bb-section-title"><Users size={20} aria-hidden="true" />Nutzer</h2>
        {data && <span className="text-xs bb-muted">{fmt(shown.length)} von {fmt(data.length)}</span>}
      </div>
      <div className="relative mb-2">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <Input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="E-Mail oder Name suchen"
          aria-label="Nutzer suchen"
          className="bg-gray-800/50 border-gray-700 text-white"
          style={{ paddingLeft: "2.25rem" }}
        />
      </div>
      <div className="flex gap-1 mb-3" role="group" aria-label="Nutzer filtern">
        {filters.map(([value, label]) => (
          <button key={value} type="button" className={`bb-admin-range${filter === value ? " is-active" : ""}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>
      {error ? <Empty>{error}</Empty> : !data ? <Busy /> : shown.length === 0 ? <Empty>Keine Nutzer in dieser Auswahl.</Empty> : (
        <>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3">
            {shown.slice(0, visible).map(user => <UserRow key={user.id} user={user} onAssigned={replace} />)}
          </ul>
          {shown.length > visible && (
            <button type="button" className="bb-action w-full mt-3" onClick={() => setVisible(v => v + USERS_PAGE)}>
              Weitere {Math.min(USERS_PAGE, shown.length - visible)} anzeigen
            </button>
          )}
        </>
      )}
    </section>
  );
}

// ── App-Schalter ───────────────────────────────────────────────────────────
// Gelten sofort für alle Nutzer (Server-Cache 30 s, Werbe-Konfiguration im
// Browser bis 5 Min.). Gespeichert in app_config (lib/appSettings.js).
const APP_SWITCHES = [
  {
    key: "ads_enabled",
    title: "Werbung anzeigen",
    on: "Werbung läuft wie im Tarif vorgesehen (Gäste, Kostenlos, Basic).",
    off: "Keine Werbung für niemanden.",
  },
  {
    key: "all_tools_free",
    title: "Alle Tools kostenlos",
    on: "Jede Funktion ist für alle freigeschaltet, auch ohne Plan. Das KI-Tageslimit für kostenlose Konten entfällt.",
    off: "Funktionen richten sich nach dem gebuchten Plan.",
    confirmOn: "Alle Tools für alle Nutzer freischalten? Das gilt, bis du es wieder ausschaltest.",
  },
];

function AppSettingsAdmin() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");

  useEffect(() => {
    superAdmin.settings()
      .then(setSettings)
      .catch(e => setError(errorText(e, "Einstellungen konnten nicht geladen werden")));
  }, []);

  const toggle = async (sw, value) => {
    if (value && sw.confirmOn && !window.confirm(sw.confirmOn)) return;
    setSaving(sw.key);
    try {
      const next = await superAdmin.updateSettings({ [sw.key]: value });
      setSettings(next);
      publishAppSettings(next);
      toast.success(`${sw.title}: ${value ? "an" : "aus"}`);
    } catch (e) {
      toast.error(errorText(e, "Speichern fehlgeschlagen"));
    }
    setSaving("");
  };

  return (
    <section className="bb-card">
      <div className="bb-section-head">
        <h2 className="bb-section-title"><SlidersHorizontal size={20} aria-hidden="true" />App-Schalter</h2>
      </div>
      {error ? <Empty>{error}</Empty> : !settings ? <Busy /> : (
        <>
          <ul className="grid gap-3">
            {APP_SWITCHES.map(sw => {
              const value = settings[sw.key] === true;
              return (
                <li key={sw.key} className="bb-admin-item items-center justify-between">
                  <div className="min-w-0">
                    <p id={`switch-${sw.key}`} className="text-sm font-semibold text-slate-100">{sw.title}</p>
                    <p className="text-xs bb-muted">{value ? sw.on : sw.off}</p>
                  </div>
                  <Switch
                    className="bb-switch"
                    checked={value}
                    disabled={saving === sw.key}
                    onCheckedChange={(next) => toggle(sw, next)}
                    aria-labelledby={`switch-${sw.key}`}
                  />
                </li>
              );
            })}
          </ul>
          {settings.updated_at && (
            <p className="text-xs bb-muted mt-3">
              Zuletzt geändert {formatDate(settings.updated_at)}{settings.updated_by ? ` von ${settings.updated_by}` : ""}.
            </p>
          )}
        </>
      )}
    </section>
  );
}

// ── Rundmail ───────────────────────────────────────────────────────────────
// ── Credits (neues Abo/Guthaben-System) ──────────────────────────────────────
// Nur echte Aggregationen aus ai_usage/credit_transactions/provider_cost_periods
// (siehe backend/src/routes/superAdmin.js). Ohne AI_CREDIT_SYSTEM_ENABLED
// liefern beide Endpunkte 404 — die Oberfläche zeigt dann einen Hinweis statt
// leerer Tabellen.
function euro(value) {
  return typeof value === "number" ? `${value.toFixed(2).replace(".", ",")} €` : "–";
}

function CreditsAdmin() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState("");
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    Promise.all([superAdmin.creditsStats(), superAdmin.creditsUsers(1, 100)])
      .then(([s, u]) => {
        setStats(s);
        setUsers(Array.isArray(u?.users) ? u.users : []);
      })
      .catch(e => {
        if (e?.status === 404) setDisabled(true);
        else setError(errorText(e, "Credit-Daten konnten nicht geladen werden"));
      });
  }, []);

  if (disabled) {
    return (
      <section className="bb-card">
        <div className="bb-section-head">
          <h2 className="bb-section-title"><Coins size={20} aria-hidden="true" />Credits</h2>
        </div>
        <Empty>Das Credit-System ist nicht aktiv (AI_CREDIT_SYSTEM_ENABLED fehlt).</Empty>
      </section>
    );
  }
  if (error) {
    return (
      <section className="bb-card">
        <div className="bb-section-head">
          <h2 className="bb-section-title"><Coins size={20} aria-hidden="true" />Credits</h2>
        </div>
        <Empty>{error}</Empty>
      </section>
    );
  }
  if (!stats || !users) return <section className="bb-card"><Busy /></section>;

  return (
    <div className="grid gap-4">
      <section className="bb-card">
        <div className="bb-section-head">
          <h2 className="bb-section-title"><Coins size={20} aria-hidden="true" />Credit-Statistik (letzte 30 Tage)</h2>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="p-3 rounded-xl" style={{ background: "rgba(0,0,0,.25)" }}>
            <div className="text-xs bb-muted">Credits verkauft</div>
            <div className="text-lg font-semibold text-white">{fmt(stats.credits_sold)}</div>
          </div>
          <div className="p-3 rounded-xl" style={{ background: "rgba(0,0,0,.25)" }}>
            <div className="text-xs bb-muted">Credits verbraucht</div>
            <div className="text-lg font-semibold text-white">{fmt(stats.credits_used)}</div>
          </div>
          <div className="p-3 rounded-xl" style={{ background: "rgba(0,0,0,.25)" }}>
            <div className="text-xs bb-muted">Umsatz aus Topups</div>
            <div className="text-lg font-semibold text-white">{euro(stats.topup_revenue_eur)}</div>
          </div>
          <div className="p-3 rounded-xl" style={{ background: "rgba(239,68,68,.12)" }}>
            <div className="text-xs bb-muted">Über 90 % Kostenlimit</div>
            <div className="text-lg font-semibold" style={{ color: "#f87171" }}>{fmt(stats.warnings?.over_90_percent ?? 0)}</div>
          </div>
          <div className="p-3 rounded-xl" style={{ background: "rgba(251,191,36,.12)" }}>
            <div className="text-xs bb-muted">Über 80 % Kostenlimit</div>
            <div className="text-lg font-semibold" style={{ color: "#fbbf24" }}>{fmt(stats.warnings?.over_80_percent ?? 0)}</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium text-white mb-2">Kosten pro Feature (30 Tage)</div>
          {(stats.cost_by_feature_eur || []).length === 0 ? (
            <p className="text-sm bb-muted">Noch keine Nutzung erfasst.</p>
          ) : (
            <ul className="grid gap-1">
              {stats.cost_by_feature_eur.map(row => (
                <li key={row.feature} className="flex justify-between text-sm">
                  <span className="bb-muted">{row.feature}</span>
                  <span className="text-white">{euro(row.cost_eur)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs bb-muted mt-2">{stats.cost_by_plan_note}</p>
          <p className="text-xs bb-muted">{stats.abuse_detection_note}</p>
        </div>
      </section>

      <section className="bb-card">
        <div className="bb-section-head">
          <h2 className="bb-section-title"><Users size={20} aria-hidden="true" />Nutzer nach Guthaben</h2>
          <span className="text-xs bb-muted">{fmt(users.length)} Nutzer</span>
        </div>
        {users.length === 0 ? <Empty>Keine Daten.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left bb-muted">
                  <th className="py-2 pr-3">Nutzer</th>
                  <th className="py-2 pr-3">Plan</th>
                  <th className="py-2 pr-3">Credits</th>
                  <th className="py-2 pr-3">Anbieterkosten</th>
                  <th className="py-2 pr-3">Anfragen</th>
                  <th className="py-2 pr-3">Voice (min)</th>
                  <th className="py-2 pr-3">Vision</th>
                  <th className="py-2 pr-3">Satellit</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const ratio = u.cost_limit_ratio;
                  const warn = ratio != null && ratio > 0.9 ? "over90" : ratio != null && ratio > 0.8 ? "over80" : null;
                  return (
                    <tr
                      key={u.id}
                      style={warn === "over90" ? { background: "rgba(239,68,68,.12)" } : warn === "over80" ? { background: "rgba(251,191,36,.08)" } : undefined}
                    >
                      <td className="py-2 pr-3 text-white">{u.email}</td>
                      <td className="py-2 pr-3">{u.plan_name}</td>
                      <td className="py-2 pr-3">{u.credits_remaining != null ? `${fmt(u.credits_remaining)} / ${fmt(u.credits_total)}` : "–"}</td>
                      <td className="py-2 pr-3">
                        {u.provider_cost_eur != null ? `${euro(u.provider_cost_eur)} / ${euro(u.cost_limit_eur)}` : "–"}
                      </td>
                      <td className="py-2 pr-3">{fmt(u.ai_requests)}</td>
                      <td className="py-2 pr-3">{fmt(u.voice_minutes)}</td>
                      <td className="py-2 pr-3">{fmt(u.vision_requests)}</td>
                      <td className="py-2 pr-3">{fmt(u.satellite_analyses)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function BroadcastMail() {
  const [status, setStatus] = useState(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    superAdmin.mailStatus().then(setStatus).catch(() => setStatus({ error: true }));
  }, []);

  const send = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error("Betreff und Nachricht ausfüllen");
      return;
    }
    const count = status?.recipients ?? "alle";
    if (!window.confirm(`E-Mail „${subject.trim()}“ jetzt an ${count} Nutzer senden? Das lässt sich nicht zurückholen.`)) return;
    setSending(true);
    setResult(null);
    try {
      const res = await superAdmin.broadcast(subject.trim(), message.trim());
      setResult(res);
      if (res.failed === 0) {
        toast.success(`An ${res.sent} Nutzer verschickt`);
        setSubject("");
        setMessage("");
      } else {
        toast.warning(`${res.sent} verschickt, ${res.failed} fehlgeschlagen`);
      }
    } catch (e) {
      toast.error(errorText(e, "Versand fehlgeschlagen"));
    }
    setSending(false);
  };

  const smtpMissing = status && !status.error && !status.smtp_configured;

  return (
    <section className="bb-card grid gap-3">
      <h2 className="bb-section-title"><Mail size={20} aria-hidden="true" />E-Mail an alle Nutzer</h2>
      <p className="text-sm bb-muted">
        {status && !status.error
          ? `${status.recipients} Empfänger. Adressen stehen nur in BCC; Antworten gehen an ${status.reply_to}.`
          : "Empfänger werden geladen …"}
      </p>
      {smtpMissing && (
        <p className="text-sm text-amber-200 p-3 rounded-lg border border-amber-600/50 bg-amber-900/20">
          E-Mail-Versand ist nicht eingerichtet: SMTP_HOST, SMTP_USER und SMTP_PASSWORD fehlen in den Server-Variablen.
        </p>
      )}
      <Input value={subject} onChange={e => setSubject(e.target.value)} maxLength={200} placeholder="Betreff" className="bg-gray-800/50 border-gray-700 text-white" aria-label="Betreff" />
      <Textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={20000} placeholder="Nachricht" className="bg-gray-800/50 border-gray-700 text-white min-h-[160px]" aria-label="Nachricht" />
      <button type="button" className="bb-action w-full" onClick={send} disabled={sending || smtpMissing}>
        {sending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
        An alle senden
      </button>
      {result && <p className="text-xs bb-muted">Zuletzt: {result.sent} von {result.recipients} verschickt{result.failed ? `, ${result.failed} fehlgeschlagen` : ""}.</p>}
    </section>
  );
}

export default function Admin() {
  const [me, setMe] = useState(undefined);

  useEffect(() => {
    auth.me().then(setMe).catch(() => setMe(null));
  }, []);

  if (me === undefined) return <div className="bb-page"><Busy /></div>;

  // Ein Backend ohne Admin-Bereich liefert das Feld gar nicht. Dann ist nicht
  // das Konto gesperrt, sondern der verbundene Server veraltet.
  if (me && !("is_superuser" in me)) {
    return (
      <div className="bb-page">
        <div className="bb-card text-center py-10">
          <ShieldAlert size={36} className="mx-auto mb-3 text-amber-400" aria-hidden="true" />
          <p className="text-slate-100 font-semibold">Server ohne Admin-Bereich</p>
          <p className="bb-muted text-sm mt-1">
            Der verbundene Server läuft noch auf einem älteren Stand und kennt den Admin-Bereich nicht.
            Sobald das aktuelle Backend live ist, erscheint er hier automatisch.
          </p>
        </div>
      </div>
    );
  }

  if (me?.is_superuser !== true) {
    return (
      <div className="bb-page">
        <div className="bb-card text-center py-10">
          <ShieldAlert size={36} className="mx-auto mb-3 text-slate-400" aria-hidden="true" />
          <p className="text-slate-100 font-semibold">Kein Zugriff</p>
          <p className="bb-muted text-sm mt-1">Der Admin-Bereich ist nur für den Superuser freigeschaltet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bb-page">
      <PageTitle title="Admin Bereich" subtitle="Statistik, Nutzer, Moderation und Support" />
      <Tabs defaultValue="stats" className="w-full min-w-0">
        <TabsList className="flex w-full justify-start overflow-x-auto scrollbar-hide">
          <TabsTrigger value="stats">Statistik</TabsTrigger>
          <TabsTrigger value="users">Nutzer</TabsTrigger>
          <TabsTrigger value="app">App</TabsTrigger>
          <TabsTrigger value="community">Community</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="mail">Rundmail</TabsTrigger>
          <TabsTrigger value="credits">Credits</TabsTrigger>
        </TabsList>
        <TabsContent value="stats" className="mt-4"><Statistics /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersAdmin /></TabsContent>
        <TabsContent value="app" className="mt-4"><AppSettingsAdmin /></TabsContent>
        <TabsContent value="community" className="mt-4"><CommunityAdmin /></TabsContent>
        <TabsContent value="events" className="mt-4"><EventsAdmin /></TabsContent>
        <TabsContent value="tickets" className="mt-4"><TicketsAdmin /></TabsContent>
        <TabsContent value="mail" className="mt-4"><BroadcastMail /></TabsContent>
        <TabsContent value="credits" className="mt-4"><CreditsAdmin /></TabsContent>
      </Tabs>
    </div>
  );
}
