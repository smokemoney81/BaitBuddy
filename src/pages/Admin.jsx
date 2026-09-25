import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  BarChart3, MessageSquare, Trophy, LifeBuoy, Mail, Trash2, RotateCcw, Loader2, ShieldAlert, Send,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import PageTitle from "@/components/layout/PageTitle";
import { auth } from "@/api/auth";
import { superAdmin } from "@/api/frontendClient";
import { TOOLS } from "@/lib/toolRegistry";

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
function ToolStats() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    superAdmin.toolStats(days)
      .then(res => { if (!cancelled) setData(res); })
      .catch(e => { if (!cancelled) setError(errorText(e, "Statistik konnte nicht geladen werden")); });
    return () => { cancelled = true; };
  }, [days]);

  const top = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages
      .map(row => ({ ...row, tool: TOOL_BY_PAGE.get(row.page) }))
      .filter(row => row.tool)
      .slice(0, 10);
  }, [data]);
  const max = top[0]?.views || 1;

  return (
    <section className="bb-card" aria-labelledby="admin-stats-title">
      <div className="bb-section-head">
        <h2 id="admin-stats-title" className="bb-section-title"><BarChart3 size={20} aria-hidden="true" />Top 10 Tools</h2>
        <div className="flex gap-1" role="group" aria-label="Zeitraum">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              aria-pressed={days === d}
              className={`bb-admin-range${days === d ? " is-active" : ""}`}
            >
              {d} T
            </button>
          ))}
        </div>
      </div>
      {error ? <Empty>{error}</Empty> : !data ? <Busy /> : top.length === 0 ? (
        <Empty>Noch keine Tool-Aufrufe im Zeitraum. Gezählt wird ab jetzt jeder Seitenaufruf angemeldeter Nutzer.</Empty>
      ) : (
        <>
          <ol className="bb-admin-bars">
            {top.map((row, i) => (
              <li key={row.page} title={`${row.tool.name}: ${row.views} Aufrufe von ${row.users} Nutzern`}>
                <span className="bb-admin-bar-rank">{i + 1}</span>
                <span className="bb-admin-bar-label">
                  <Link to={row.tool.route}>{row.tool.name}</Link>
                  <span className="bb-admin-bar-track" aria-hidden="true">
                    <span className="bb-admin-bar-fill" style={{ width: `${Math.max(2, (row.views / max) * 100)}%` }} />
                  </span>
                </span>
                <span className="bb-admin-bar-value">
                  {row.views}
                  <small>{row.users} Nutzer</small>
                </span>
              </li>
            ))}
          </ol>
          <p className="text-xs bb-muted mt-3">{data.total_views} Seitenaufrufe in den letzten {data.days} Tagen.</p>
        </>
      )}
    </section>
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

// ── Rundmail ───────────────────────────────────────────────────────────────
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
      <PageTitle title="Admin Bereich" subtitle="Statistik, Moderation und Support" />
      <Tabs defaultValue="stats" className="w-full min-w-0">
        <TabsList className="flex w-full justify-start overflow-x-auto scrollbar-hide">
          <TabsTrigger value="stats">Statistik</TabsTrigger>
          <TabsTrigger value="community">Community</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="tickets">Tickets</TabsTrigger>
          <TabsTrigger value="mail">Rundmail</TabsTrigger>
        </TabsList>
        <TabsContent value="stats" className="mt-4"><ToolStats /></TabsContent>
        <TabsContent value="community" className="mt-4"><CommunityAdmin /></TabsContent>
        <TabsContent value="events" className="mt-4"><EventsAdmin /></TabsContent>
        <TabsContent value="tickets" className="mt-4"><TicketsAdmin /></TabsContent>
        <TabsContent value="mail" className="mt-4"><BroadcastMail /></TabsContent>
      </Tabs>
    </div>
  );
}
