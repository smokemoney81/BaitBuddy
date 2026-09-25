import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Trophy, Users, Clock, Lock, LockOpen, Ruler, Fish, Star, Camera, Send, Loader2, CheckCircle2,
  AlertTriangle, XCircle, Scale, Share2, CalendarDays, ChevronRight, Mail, ShieldCheck, Gavel,
} from 'lucide-react';
import { events, integrations } from '@/api/frontendClient';
import { auth } from '@/api/auth';
import { useEventActivityTracking } from '@/hooks/useEventActivityTracking';
import { useFeatureTracking } from '@/hooks/useFeatureTracking';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PageTitle from '@/components/layout/PageTitle';
import { fishImageFor } from '@/lib/fishImages';

const METRICS = [
  { id: 'total_length', icon: Ruler, title: 'Gesamtlänge', text: 'Summe aller Fische (cm)' },
  { id: 'biggest', icon: Trophy, title: 'Größter Fisch', text: 'Längster Einzelfisch (cm)' },
  { id: 'count', icon: Fish, title: 'Anzahl', text: 'Anzahl gewerteter Fische' },
  { id: 'points', icon: Star, title: 'Punkte', text: 'Spezies-Bonus & Sonderpunkte' },
];
const METRIC_FROM_SCORING = { length: 'total_length', total_length: 'total_length', biggest: 'biggest', max_length: 'biggest', count: 'count', points: 'points' };

const DAY = 24 * 60 * 60 * 1000;

function toLocalInput(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDay(value) {
  return value ? new Date(value).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
}

function speciesList(target) {
  return String(target || '').split(/[,;/·•]|\bund\b/i).map(s => s.trim()).filter(Boolean);
}

function phaseOf(event, now) {
  const start = event?.start_date ? new Date(event.start_date).getTime() : null;
  const end = event?.end_date ? new Date(event.end_date).getTime() : null;
  if (event?.status === 'ended' || (end && end < now)) return { key: 'ended', label: 'Beendet' };
  if (start && start > now) {
    const days = Math.ceil((start - now) / DAY);
    return { key: 'upcoming', label: `Startet in ${days} ${days === 1 ? 'Tag' : 'Tagen'}` };
  }
  if (!end) return { key: 'running', label: 'Läuft' };
  const left = end - now;
  if (left < DAY) {
    const hours = Math.max(1, Math.ceil(left / 3600000));
    return { key: 'running', label: `${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}` };
  }
  const days = Math.ceil(left / DAY);
  return { key: 'running', label: `${days} ${days === 1 ? 'Tag' : 'Tage'}` };
}

function metricValue(entry, metric) {
  if (metric === 'count') return `${entry.count} ${entry.count === 1 ? 'Fisch' : 'Fische'}`;
  if (metric === 'points') return `${entry.points} P`;
  if (metric === 'biggest') return `${entry.biggest} cm`;
  return `${entry.total_length} cm`;
}

function initials(name) {
  return String(name || '?').split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function SubmissionSteps({ submission }) {
  const flagged = (submission.plausibility || []).some(c => !c.ok);
  const status = submission.review_status;
  const steps = [
    { label: 'Eingereicht', state: 'done' },
    { label: 'Plausibilität', state: flagged ? 'warn' : 'done' },
    { label: 'In Prüfung', state: status === 'pending' ? 'active' : 'done' },
    status === 'rejected'
      ? { label: 'Abgelehnt', state: 'rejected' }
      : { label: 'Bestätigt', state: status === 'confirmed' ? 'done' : 'idle' },
  ];
  return (
    <ol className="bb-comp-steps" aria-label="Prüfstatus">
      {steps.map(step => (
        <li key={step.label} className={`is-${step.state}`}>
          <span className="bb-comp-step-dot" aria-hidden="true">
            {step.state === 'done' ? <CheckCircle2 size={16} /> : step.state === 'rejected' ? <XCircle size={16} /> : step.state === 'warn' ? <AlertTriangle size={14} /> : step.state === 'active' ? <Clock size={14} /> : null}
          </span>
          <small>{step.label}</small>
        </li>
      ))}
    </ol>
  );
}

export default function EventDetails() {
  useFeatureTracking('event_details');
  const { trackCatchSubmission } = useEventActivityTracking();
  const { eventId } = useParams();
  const [event, setEvent] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState(null);
  const [standings, setStandings] = useState([]);
  const [mine, setMine] = useState([]);
  const [review, setReview] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [now, setNow] = useState(Date.now());

  const [form, setForm] = useState({ species: '', length_cm: '', weight_kg: '', catch_time: toLocalInput() });
  const [photo, setPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [lastChecks, setLastChecks] = useState(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviting, setInviting] = useState(false);

  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeTarget, setDisputeTarget] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [disputing, setDisputing] = useState(false);

  const isOwner = Boolean(event && currentUser && event.created_by === currentUser.email);
  const isParticipant = participants.some(p => p.is_me);
  const phase = phaseOf(event, now);
  const targets = useMemo(() => speciesList(event?.target_species), [event?.target_species]);
  const photoPreview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const loadStandings = useCallback(async (m) => {
    try {
      const result = await events.standings(eventId, m);
      setStandings(Array.isArray(result?.entries) ? result.entries : []);
    } catch {
      setStandings([]);
    }
  }, [eventId]);

  const loadAll = useCallback(async () => {
    try {
      const [user, eventData, participantData] = await Promise.all([
        auth.me().catch(() => null),
        events.get(eventId),
        events.participants(eventId).catch(() => []),
      ]);
      setCurrentUser(user);
      setEvent(eventData);
      setParticipants(Array.isArray(participantData) ? participantData : []);
      const initialMetric = METRIC_FROM_SCORING[eventData?.scoring_method] || 'total_length';
      setMetric(prev => prev || initialMetric);
      if (user) {
        const own = await events.mySubmissions(eventId).catch(() => []);
        setMine(Array.isArray(own) ? own : []);
        if (eventData?.created_by === user.email) {
          const queue = await events.reviewQueue(eventId).catch(() => null);
          setReview(queue && Array.isArray(queue.pending) && Array.isArray(queue.disputes) ? queue : null);
        }
      }
    } catch {
      toast.error('Der Wettbewerb konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (metric) loadStandings(metric); }, [metric, loadStandings]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (targets.length && !form.species) setForm(f => ({ ...f, species: targets[0] }));
  }, [targets, form.species]);

  const join = async () => {
    try {
      await events.join(eventId);
      toast.success('Du nimmst am Wettbewerb teil.');
      await loadAll();
    } catch {
      toast.error('Beitreten fehlgeschlagen.');
    }
  };

  const submitCatch = async (e) => {
    e.preventDefault();
    if (!form.species.trim() || !form.length_cm) {
      toast.error('Fischart und Länge sind erforderlich.');
      return;
    }
    setSubmitting(true);
    setLastChecks(null);
    try {
      let photoUrl = null;
      if (photo) {
        const uploaded = await integrations.Core.UploadFile({ file: photo });
        photoUrl = uploaded.file_url;
      }
      const result = await events.submit(eventId, {
        species: form.species.trim(),
        length_cm: parseFloat(form.length_cm),
        weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
        photo_url: photoUrl,
        catch_time: new Date(form.catch_time).toISOString(),
      });
      setLastChecks(result?.checks || null);
      trackCatchSubmission(eventId);
      toast.success(result?.review_status === 'pending' ? 'Eingereicht – der Veranstalter prüft den Fang.' : 'Fang eingereicht und gewertet.');
      setForm(f => ({ ...f, length_cm: '', weight_kg: '', catch_time: toLocalInput() }));
      setPhoto(null);
      await Promise.all([loadAll(), loadStandings(metric)]);
    } catch (error) {
      if (error?.data?.checks) setLastChecks(error.data.checks);
      toast.error(error?.data?.error || error?.message || 'Einreichen fehlgeschlagen.');
    } finally {
      setSubmitting(false);
    }
  };

  const decide = async (submissionId, decision) => {
    try {
      await events.reviewSubmission(eventId, submissionId, decision);
      toast.success(decision === 'confirm' ? 'Fang bestätigt.' : 'Fang abgelehnt.');
      await Promise.all([loadAll(), loadStandings(metric)]);
    } catch (error) {
      toast.error(error?.data?.error || 'Prüfung fehlgeschlagen.');
    }
  };

  const resolve = async (disputeId, decision) => {
    try {
      await events.resolveDispute(eventId, disputeId, decision);
      toast.success(decision === 'upheld' ? 'Einspruch stattgegeben – der Fang zählt nicht mehr.' : 'Einspruch zurückgewiesen.');
      await Promise.all([loadAll(), loadStandings(metric)]);
    } catch (error) {
      toast.error(error?.data?.error || 'Entscheidung fehlgeschlagen.');
    }
  };

  const sendDispute = async () => {
    if (!disputeTarget || disputeReason.trim().length < 10) {
      toast.error('Wähle einen Fang und begründe den Einspruch (mindestens 10 Zeichen).');
      return;
    }
    setDisputing(true);
    try {
      await events.dispute(eventId, disputeTarget, disputeReason.trim());
      toast.success('Einspruch eingereicht. Der Veranstalter entscheidet.');
      setDisputeOpen(false);
      setDisputeReason('');
      setDisputeTarget('');
    } catch (error) {
      toast.error(error?.data?.error || 'Einspruch fehlgeschlagen.');
    } finally {
      setDisputing(false);
    }
  };

  const invite = async () => {
    const list = inviteEmails.split(',').map(e => e.trim()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (!list.length) { toast.error('Bitte gib gültige E-Mail-Adressen ein.'); return; }
    setInviting(true);
    try {
      await events.invite(eventId, list);
      toast.success(`${list.length} ${list.length === 1 ? 'Einladung' : 'Einladungen'} verschickt.`);
      setInviteEmails('');
      setInviteOpen(false);
    } catch (error) {
      toast.error(error?.data?.error || 'Einladen fehlgeschlagen.');
    } finally {
      setInviting(false);
    }
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: event?.name || 'Wettbewerb', url });
      else { await navigator.clipboard.writeText(url); toast.success('Link kopiert.'); }
    } catch { /* Teilen abgebrochen */ }
  };

  const disputeOptions = useMemo(() => standings
    .filter(entry => !entry.is_me)
    .flatMap(entry => (entry.submissions || []).map(sub => ({
      id: sub.id,
      label: `${entry.name}: ${sub.species}${sub.length_cm ? ` · ${sub.length_cm} cm` : ''}${sub.catch_time ? ` · ${formatDay(sub.catch_time)}` : ''}`,
    }))), [standings]);

  if (loading) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="w-8 h-8 animate-spin text-cyan-300" aria-label="Lädt" /></div>;
  }

  if (!event) {
    return (
      <div className="bb-page">
        <PageTitle title="Wettbewerb" />
        <div className="bb-card text-center">
          <p className="text-slate-200">Dieser Wettbewerb existiert nicht mehr.</p>
          <Link to="/Events" className="bb-action mt-4 inline-flex">Zu den Events</Link>
        </div>
      </div>
    );
  }

  const nameWords = String(event.name || event.title || 'Wettbewerb').trim().split(' ');
  const accent = nameWords.length > 1 ? nameWords.pop() : null;
  const started = event.start_date && new Date(event.start_date).getTime() <= now;
  const canSubmit = isParticipant && phase.key === 'running';

  return (
    <div className="bb-page bb-comp">
      <PageTitle
        title="Wettbewerb"
        rightAction={<button type="button" className="bb-round-btn" onClick={share} aria-label="Wettbewerb teilen"><Share2 size={20} aria-hidden="true" /></button>}
      />

      <section className="bb-card bb-comp-hero">
        <div className="bb-comp-hero-main">
          <span className="bb-comp-hero-icon" aria-hidden="true"><Fish size={34} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="bb-comp-name">{nameWords.join(' ')}{accent && <> <span className="bb-title-accent">{accent}</span></>}</h2>
            <p className="bb-comp-dates"><CalendarDays size={15} aria-hidden="true" />{formatDay(event.start_date)} – {formatDay(event.end_date)}</p>
            {event.description && <p className="bb-comp-desc">{event.description}</p>}
          </div>
          {event.prize_description && (
            <span className="bb-comp-prize"><Trophy size={30} aria-hidden="true" /><small>{event.prize_description}</small></span>
          )}
        </div>
        <div className="bb-comp-stats">
          <span><Users size={22} aria-hidden="true" /><strong>{participants.length}</strong><small>Teilnehmer</small></span>
          <span><Fish size={22} aria-hidden="true" /><strong>{targets.length ? targets.join(' · ') : 'Alle Arten'}</strong><small>Zielarten</small></span>
          <span><Clock size={22} aria-hidden="true" /><strong>{phase.key === 'running' ? `Noch ${phase.label}` : phase.label}</strong><small>{phase.key === 'running' ? 'Restzeit' : 'Status'}</small></span>
        </div>
      </section>

      <section className="bb-card bb-comp-rules">
        <div className="bb-comp-rules-head">
          <span className="bb-comp-lock" aria-hidden="true">{started ? <Lock size={22} /> : <LockOpen size={22} />}</span>
          <span className="min-w-0 flex-1">
            <strong>{started ? 'Regeln gesperrt' : 'Regeln bis zum Start änderbar'}</strong>
            <small>{started ? 'Die Wettbewerbsregeln sind fixiert und für alle Teilnehmer identisch.' : 'Ab dem Start sind Wertung, Zielarten und Zeitraum fixiert.'}</small>
          </span>
          <button type="button" className="bb-comp-chip-btn" onClick={() => setShowRules(v => !v)} aria-expanded={showRules}>
            {showRules ? 'Schließen' : 'Regeln ansehen'}
          </button>
        </div>
        {showRules && (
          <ul className="bb-comp-rule-list">
            <li><strong>Zeitraum:</strong> {formatDateTime(event.start_date)} bis {formatDateTime(event.end_date)}</li>
            <li><strong>Zielarten:</strong> {targets.length ? targets.join(', ') : 'jede Fischart'}</li>
            <li><strong>Offizielle Wertung:</strong> {METRICS.find(m => m.id === (METRIC_FROM_SCORING[event.scoring_method] || 'total_length'))?.title}</li>
            <li><strong>Prüfung:</strong> {event.requires_approval ? 'Jeder Fang zählt erst nach Freigabe durch den Veranstalter.' : 'Fänge zählen nach der automatischen Plausibilitätsprüfung; Auffälligkeiten prüft der Veranstalter.'}</li>
            <li><strong>Einsprüche:</strong> Teilnehmer können gegen gewertete Fänge Einspruch einlegen; der Veranstalter entscheidet.</li>
            {event.prize_description && <li><strong>Preise:</strong> {event.prize_description}</li>}
          </ul>
        )}
      </section>

      <section aria-labelledby="comp-metric">
        <div className="bb-section-head">
          <h2 id="comp-metric" className="bb-section-title">Wertung</h2>
          <small className="text-slate-400">Offizielle Wertungskategorien</small>
        </div>
        <div className="bb-comp-metrics" role="tablist" aria-label="Wertungskategorie">
          {METRICS.map(m => (
            <button key={m.id} type="button" role="tab" aria-selected={metric === m.id} className={`bb-comp-metric${metric === m.id ? ' is-active' : ''}`} onClick={() => setMetric(m.id)}>
              <m.icon size={26} aria-hidden="true" />
              <strong>{m.title}</strong>
              <small>{m.text}</small>
            </button>
          ))}
        </div>
      </section>

      {!isParticipant && phase.key !== 'ended' && (
        <section className="bb-card bb-comp-join">
          <p>{currentUser ? 'Tritt bei, um Fänge einzureichen und in der Rangliste zu erscheinen.' : 'Melde dich an, um teilzunehmen.'}</p>
          {currentUser
            ? <button type="button" className="bb-action bb-action-block" onClick={join}><Users size={20} aria-hidden="true" className="bb-action-icon" /><span>Teilnehmen</span><ChevronRight size={20} aria-hidden="true" className="bb-action-arrow" /></button>
            : <Link to="/Home" className="bb-action bb-action-block"><span>Anmelden</span><ChevronRight size={20} aria-hidden="true" className="bb-action-arrow" /></Link>}
        </section>
      )}

      {canSubmit && (
        <form className="bb-card bb-comp-submit" onSubmit={submitCatch}>
          <div className="bb-comp-submit-head">
            <h2>Fang einreichen</h2>
            <span className="bb-comp-plaus"><ShieldCheck size={18} aria-hidden="true" /><span><strong>Plausibilitätsprüfung</strong><small>Automatische Prüfung beim Absenden</small></span></span>
          </div>
          <div className="bb-comp-submit-grid">
            <label className="bb-comp-photo">
              {photoPreview ? <img src={photoPreview} alt="Ausgewähltes Fangfoto" /> : <span className="bb-comp-photo-empty"><Fish size={40} aria-hidden="true" /></span>}
              <span className="bb-comp-photo-btn"><Camera size={18} aria-hidden="true" />{photo ? 'Foto ändern' : 'Foto hinzufügen'}</span>
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={e => setPhoto(e.target.files?.[0] || null)} />
            </label>
            <div className="bb-comp-fields">
              <label>
                <small>Fischart</small>
                {targets.length ? (
                  <select value={form.species} onChange={e => setForm(f => ({ ...f, species: e.target.value }))}>
                    {targets.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : (
                  <input type="text" value={form.species} onChange={e => setForm(f => ({ ...f, species: e.target.value }))} placeholder="z. B. Zander" required />
                )}
              </label>
              <label>
                <small>Länge (cm)</small>
                <input type="number" inputMode="decimal" min="1" max="400" step="0.5" value={form.length_cm} onChange={e => setForm(f => ({ ...f, length_cm: e.target.value }))} required />
              </label>
              <label>
                <small>Gewicht (kg, optional)</small>
                <input type="number" inputMode="decimal" min="0" max="200" step="0.01" value={form.weight_kg} onChange={e => setForm(f => ({ ...f, weight_kg: e.target.value }))} />
              </label>
              <label>
                <small>Datum & Uhrzeit</small>
                <input type="datetime-local" value={form.catch_time} onChange={e => setForm(f => ({ ...f, catch_time: e.target.value }))} required />
              </label>
            </div>
          </div>
          {lastChecks && (
            <ul className="bb-comp-checks" aria-label="Ergebnis der Plausibilitätsprüfung">
              {lastChecks.map(check => (
                <li key={check.id} className={check.ok ? 'is-ok' : check.severity === 'block' ? 'is-block' : 'is-review'}>
                  {check.ok ? <CheckCircle2 size={16} aria-hidden="true" /> : check.severity === 'block' ? <XCircle size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
                  <span>{check.ok ? check.label : check.message}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="submit" className="bb-action bb-action-block" disabled={submitting}>
            {submitting ? <Loader2 size={20} aria-hidden="true" className="animate-spin bb-action-icon" /> : <Send size={20} aria-hidden="true" className="bb-action-icon" />}
            <span>{submitting ? 'Wird geprüft …' : 'Fang einreichen'}</span>
          </button>
        </form>
      )}

      {mine.length > 0 && (
        <section className="bb-card" aria-labelledby="comp-mine">
          <h2 id="comp-mine" className="bb-comp-card-title">Meine Einreichungen</h2>
          <ul className="bb-comp-mine">
            {mine.map(sub => {
              const image = sub.photo_url || fishImageFor(sub.species);
              return (
                <li key={sub.id}>
                  <span className="bb-comp-thumb">{image ? <img src={image} alt="" /> : <Fish size={24} aria-hidden="true" />}</span>
                  <span className="min-w-0">
                    <strong>{sub.species}{sub.length_cm ? ` · ${sub.length_cm} cm` : ''}</strong>
                    <small>{formatDateTime(sub.catch_time)}</small>
                    {sub.review_note && <small className="text-amber-300">{sub.review_note}</small>}
                  </span>
                  <SubmissionSteps submission={sub} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="comp-ranking">
        <div className="bb-section-head">
          <h2 id="comp-ranking" className="bb-section-title"><Trophy size={22} aria-hidden="true" />Rangliste</h2>
          <span className="bb-comp-confirmed"><CheckCircle2 size={14} aria-hidden="true" />Nur bestätigte Fänge</span>
        </div>
        {standings.length ? (
          <ol className="bb-card bb-comp-ranking">
            {standings.map(entry => (
              <li key={`${entry.rank}-${entry.name}`} className={entry.is_me ? 'is-me' : ''}>
                <span className={`bb-comp-rank is-${entry.rank <= 3 ? entry.rank : 'n'}`}>{entry.rank}</span>
                <span className="bb-comp-avatar" aria-hidden="true">{initials(entry.name)}</span>
                <span className="min-w-0 flex-1">
                  <strong>{entry.is_me ? 'Du' : entry.name}</strong>
                  <small>{entry.count} {entry.count === 1 ? 'Fisch' : 'Fische'}{entry.biggest ? ` · Größter: ${entry.biggest} cm` : ''}</small>
                </span>
                <span className="bb-comp-value">{metricValue(entry, metric)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="bb-card text-sm text-slate-300">Noch keine bestätigten Fänge in dieser Wertung.</p>
        )}
      </section>

      {isParticipant && disputeOptions.length > 0 && (
        <section className="bb-card bb-comp-dispute">
          <Scale size={30} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <strong>Einspruch</strong>
            <small>Du hast Zweifel an einem Fang? Reiche einen Einspruch ein.</small>
          </span>
          <button type="button" className="bb-comp-chip-btn" onClick={() => setDisputeOpen(true)}>Einspruch</button>
        </section>
      )}

      {isOwner && review && (
        <section className="bb-card bb-comp-review" aria-labelledby="comp-review">
          <h2 id="comp-review" className="bb-comp-card-title"><Gavel size={20} aria-hidden="true" />Prüfungen als Veranstalter</h2>
          {review.pending.length === 0 && review.disputes.length === 0 && <p className="text-sm text-slate-300">Nichts zu prüfen.</p>}
          {review.pending.map(sub => (
            <article key={sub.id} className="bb-comp-review-item">
              {sub.photo_url && <img src={sub.photo_url} alt={`Fangfoto ${sub.species}`} />}
              <div className="min-w-0 flex-1">
                <strong>{sub.angler}: {sub.species}{sub.length_cm ? ` · ${sub.length_cm} cm` : ''}{sub.weight_kg ? ` · ${sub.weight_kg} kg` : ''}</strong>
                <small>{formatDateTime(sub.catch_time)}</small>
                {(sub.plausibility || []).filter(c => !c.ok).map(c => <small key={c.id} className="text-amber-300">{c.message}</small>)}
                <div className="bb-comp-review-actions">
                  <button type="button" className="bb-comp-ok" onClick={() => decide(sub.id, 'confirm')}>Bestätigen</button>
                  <button type="button" className="bb-comp-no" onClick={() => decide(sub.id, 'reject')}>Ablehnen</button>
                </div>
              </div>
            </article>
          ))}
          {review.disputes.map(dispute => (
            <article key={dispute.id} className="bb-comp-review-item is-dispute">
              <div className="min-w-0 flex-1">
                <strong>Einspruch von {dispute.reporter}</strong>
                {dispute.submission && <small>Gegen {dispute.submission.angler}: {dispute.submission.species}{dispute.submission.length_cm ? ` · ${dispute.submission.length_cm} cm` : ''}</small>}
                <p>{dispute.reason}</p>
                <div className="bb-comp-review-actions">
                  <button type="button" className="bb-comp-no" onClick={() => resolve(dispute.id, 'upheld')}>Stattgeben</button>
                  <button type="button" className="bb-comp-ok" onClick={() => resolve(dispute.id, 'dismissed')}>Zurückweisen</button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {isParticipant && phase.key !== 'ended' && (
        <button type="button" className="bb-secondary justify-center" onClick={() => setInviteOpen(true)}>
          <Mail size={18} aria-hidden="true" /> Angler einladen
        </button>
      )}

      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent className="bb-app border-0">
          <DialogHeader>
            <DialogTitle>Einspruch einlegen</DialogTitle>
            <DialogDescription>Der Veranstalter prüft deinen Einspruch. Gibt er ihm statt, zählt der Fang nicht mehr.</DialogDescription>
          </DialogHeader>
          <label className="grid gap-1 text-sm text-slate-300">
            Fang
            <select className="bb-comp-input" value={disputeTarget} onChange={e => setDisputeTarget(e.target.value)}>
              <option value="">Bitte wählen</option>
              {disputeOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm text-slate-300">
            Begründung
            <textarea className="bb-comp-input" rows={4} maxLength={1000} value={disputeReason} onChange={e => setDisputeReason(e.target.value)} placeholder="Was stimmt an diesem Fang nicht?" />
          </label>
          <button type="button" className="bb-action bb-action-block" onClick={sendDispute} disabled={disputing}>
            {disputing ? <Loader2 size={18} aria-hidden="true" className="animate-spin" /> : <Scale size={18} aria-hidden="true" />}<span>Einspruch senden</span>
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="bb-app border-0">
          <DialogHeader>
            <DialogTitle>Angler einladen</DialogTitle>
            <DialogDescription>Mehrere E-Mail-Adressen mit Komma trennen.</DialogDescription>
          </DialogHeader>
          <input className="bb-comp-input" type="text" value={inviteEmails} onChange={e => setInviteEmails(e.target.value)} placeholder="name@beispiel.de, …" />
          <button type="button" className="bb-action bb-action-block" onClick={invite} disabled={inviting}>
            {inviting ? <Loader2 size={18} aria-hidden="true" className="animate-spin" /> : <Send size={18} aria-hidden="true" />}<span>Einladungen senden</span>
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
