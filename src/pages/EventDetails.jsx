import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { events } from '@/api/frontendClient';
import { auth } from '@/api/auth';
import { useEventActivityTracking } from '@/hooks/useEventActivityTracking';
import { useFeatureTracking } from '@/hooks/useFeatureTracking';
import { toast } from 'sonner';
import {
  Trophy, Users, Clock, Target, ChevronLeft, Camera,
  CheckCircle2, AlertCircle, Loader2, Fish, MapPin,
  Calendar, Send, ChevronRight, Award, Crown
} from 'lucide-react';

const SCORE_CATS = [
  { key: 'total_length', label: 'Gesamtlänge', unit: 'cm', icon: '📏', color: '#00E5FF' },
  { key: 'biggest_fish', label: 'Größter Fisch', unit: 'cm', icon: '🐟', color: '#00FF9D' },
  { key: 'catch_count', label: 'Anzahl', unit: 'Fänge', icon: '🎣', color: '#FF9F0A' },
  { key: 'points', label: 'Punkte', unit: 'Pts', icon: '⬡', color: '#A855F7' },
];

function ScoreCatCard({ cat }) {
  return (
    <div
      className="rounded-xl p-3 border border-white/8 text-center flex flex-col items-center gap-1"
      style={{ background: 'rgba(15,30,45,0.75)' }}
    >
      <div className="text-xl">{cat.icon}</div>
      <div className="text-[11px] font-bold" style={{ color: cat.color }}>{cat.label}</div>
      <div className="text-[10px] text-white/40">{cat.unit}</div>
    </div>
  );
}

function LeaderboardRow({ rank, entry }) {
  const isTop3 = rank <= 3;
  const medals = ['', '🥇', '🥈', '🥉'];
  return (
    <div
      className={`flex items-center gap-3 py-3 px-3 rounded-xl border mb-2 ${
        isTop3 ? 'border-amber-400/30' : 'border-white/8'
      }`}
      style={{ background: isTop3 ? 'rgba(180,130,0,0.08)' : 'rgba(15,30,45,0.6)' }}
    >
      <div className="w-7 text-center">
        {isTop3 ? (
          <span className="text-base">{medals[rank]}</span>
        ) : (
          <span className="text-sm text-white/40 font-bold">{rank}</span>
        )}
      </div>
      <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center shrink-0"
        style={{ background: 'rgba(0,180,255,0.1)' }}>
        <Fish size={14} className="text-cyan-400/60" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-white truncate">
          {entry.display_name || entry.user_email?.split('@')[0] || 'Angler'}
        </div>
        <div className="text-[10px] text-white/40">
          {entry.submission_count || 0} Fänge · {entry.total_length || 0} cm
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-extrabold text-amber-400">{entry.score || entry.points || 0}</div>
        <div className="text-[9px] text-white/30">Punkte</div>
      </div>
      {entry.status === 'confirmed' && (
        <CheckCircle2 size={14} className="text-green-400 shrink-0" />
      )}
    </div>
  );
}

export default function EventDetails() {
  useFeatureTracking('event_details');
  const { trackCatchSubmission } = useEventActivityTracking();
  const { eventId } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteEmails, setInviteEmails] = useState('');
  const [isParticipant, setIsParticipant] = useState(false);
  const [mySubmissions, setMySubmissions] = useState([]);

  const [form, setForm] = useState({ species: '', length_cm: '', weight_kg: '', photo_url: '' });

  useEffect(() => { loadData(); }, [eventId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [user, eventData, participantsData, leaderboardData] = await Promise.all([
        auth.me(),
        events.get(eventId),
        events.participants(eventId),
        events.leaderboard(eventId),
      ]);
      setCurrentUser(user);
      setEvent(eventData);
      setParticipants(Array.isArray(participantsData) ? participantsData : []);
      setLeaderboard(Array.isArray(leaderboardData) ? leaderboardData : []);
      setIsParticipant(Array.isArray(participantsData) && participantsData.some(p => p.user_id === user?.email));
      const my = Array.isArray(leaderboardData) ? leaderboardData.filter(e => e.user_email === user?.email) : [];
      setMySubmissions(my);
    } catch {
      toast.error('Fehler beim Laden des Events');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    try {
      await events.join(eventId);
      toast.success('Du bist dem Event beigetreten');
      loadData();
    } catch { toast.error('Fehler beim Beitreten'); }
  };

  const handleSubmitCatch = async () => {
    if (!form.species || !form.length_cm) { toast.error('Art und Länge erforderlich'); return; }
    try {
      setSubmitting(true);
      await events.submit(eventId, {
        species: form.species,
        length_cm: parseFloat(form.length_cm),
        weight_kg: form.weight_kg ? parseFloat(form.weight_kg) : null,
        photo_url: form.photo_url || null,
        catch_time: new Date().toISOString(),
      });
      trackCatchSubmission(eventId);
      toast.success('Fang eingereicht');
      setForm({ species: '', length_cm: '', weight_kg: '', photo_url: '' });
      loadData();
    } catch { toast.error('Fehler beim Einreichen'); }
    finally { setSubmitting(false); }
  };

  const handleInvite = async () => {
    const list = inviteEmails.split(',').map(e => e.trim()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (!list.length) { toast.error('Gültige E-Mails erforderlich'); return; }
    try {
      setInviting(true);
      await events.invite(eventId, list);
      toast.success(`${list.length} Einladung(en) versendet`);
      setInviteEmails('');
    } catch { toast.error('Fehler beim Versenden'); }
    finally { setInviting(false); }
  };

  const daysLeft = event
    ? Math.max(0, Math.ceil((new Date(event.end_date) - new Date()) / 86400000))
    : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#080F16' }}>
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#080F16' }}>
        <div className="text-center">
          <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
          <div className="text-white font-bold mb-4">Event nicht gefunden</div>
          <button
            type="button"
            onClick={() => navigate('/Events')}
            className="px-5 py-2.5 rounded-xl font-semibold text-black text-sm"
            style={{ background: '#00E5FF' }}
          >
            Zurück zu Events
          </button>
        </div>
      </div>
    );
  }

  const canInvite = event.created_by === currentUser?.email;

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
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 60% 25%, rgba(255,200,0,0.09) 0%, transparent 55%)' }} />

        <div className="relative flex items-center justify-between px-4 pt-4 pb-3">
          <button type="button" onClick={() => navigate('/Events')}
            className="w-9 h-9 rounded-full flex items-center justify-center border border-white/15 bg-white/5">
            <ChevronLeft size={20} className="text-white/80" />
          </button>
          <div className="px-3 py-1 rounded-full text-[10px] font-bold text-amber-400 flex items-center gap-1"
            style={{ background: 'rgba(180,130,0,0.2)', border: '1px solid rgba(180,130,0,0.4)' }}>
            <Trophy size={9} /> {event.type === 'tournament' ? 'Turnier' : 'Event'}
          </div>
        </div>

        <div className="relative px-4 pt-1 pb-6">
          <h1 className="text-2xl font-extrabold text-white leading-tight mb-1">
            {event.name || 'Raubfisch-Cup Hennesee'}
          </h1>
          {event.description && (
            <p className="text-[13px] text-white/50 mb-3 leading-relaxed">{event.description}</p>
          )}
          <div className="flex flex-wrap gap-3">
            {event.start_date && (
              <div className="flex items-center gap-1.5 text-[12px] text-white/60">
                <Calendar size={12} className="text-cyan-400" />
                {new Date(event.start_date).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                {event.end_date && ' – ' + new Date(event.end_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
              </div>
            )}
            {event.location && (
              <div className="flex items-center gap-1.5 text-[12px] text-white/60">
                <MapPin size={12} className="text-cyan-400" /> {event.location}
              </div>
            )}
            {daysLeft !== null && (
              <div className="flex items-center gap-1.5 text-[12px] text-white/60">
                <Clock size={12} className="text-cyan-400" />
                {daysLeft > 0 ? `${daysLeft} Tage verbleibend` : 'Beendet'}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-[12px] text-white/60">
              <Users size={12} className="text-cyan-400" /> {participants.length} Teilnehmer
            </div>
          </div>
        </div>
      </div>

      <div className="px-4" style={{ paddingBottom: 'calc(100px + env(safe-area-inset-bottom))' }}>

        {/* Join / Joined status */}
        {!isParticipant ? (
          <button
            type="button"
            onClick={handleJoin}
            className="w-full py-4 rounded-2xl font-bold text-black text-base flex items-center justify-center gap-2 mb-4"
            style={{ background: 'linear-gradient(90deg, #00B4CC, #00E5FF)' }}
          >
            <Target size={18} /> Jetzt teilnehmen
          </button>
        ) : (
          <div
            className="w-full py-3 rounded-2xl flex items-center justify-center gap-2 mb-4 border border-green-500/30"
            style={{ background: 'rgba(0,255,100,0.06)' }}
          >
            <CheckCircle2 size={16} className="text-green-400" />
            <span className="text-sm font-semibold text-green-400">Du nimmst teil</span>
          </div>
        )}

        {/* Scoring categories */}
        <div className="mb-4">
          <div className="text-sm font-bold text-white mb-2">Wertungskategorien</div>
          <div className="grid grid-cols-4 gap-2">
            {SCORE_CATS.map(cat => <ScoreCatCard key={cat.key} cat={cat} />)}
          </div>
        </div>

        {/* Submit catch */}
        {isParticipant && (
          <div
            className="rounded-2xl border border-white/10 p-4 mb-4"
            style={{ background: 'rgba(15,30,45,0.85)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
                <Fish size={15} className="text-cyan-400" />
              </div>
              <div className="text-sm font-bold text-white">Fang einreichen</div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-[10px] text-white/40 mb-1 block">Fischart *</label>
                <input
                  type="text"
                  placeholder="z. B. Zander"
                  value={form.species}
                  onChange={e => setForm(f => ({ ...f, species: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-white/25 border border-white/15 outline-none focus:border-cyan-500/50"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40 mb-1 block">Länge (cm) *</label>
                <input
                  type="number"
                  placeholder="z. B. 62"
                  value={form.length_cm}
                  onChange={e => setForm(f => ({ ...f, length_cm: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-white/25 border border-white/15 outline-none focus:border-cyan-500/50"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40 mb-1 block">Gewicht (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="z. B. 3.4"
                  value={form.weight_kg}
                  onChange={e => setForm(f => ({ ...f, weight_kg: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-white/25 border border-white/15 outline-none focus:border-cyan-500/50"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                />
              </div>
              <div>
                <label className="text-[10px] text-white/40 mb-1 block">Foto-URL</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="URL oder leer lassen"
                    value={form.photo_url}
                    onChange={e => setForm(f => ({ ...f, photo_url: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-white/25 border border-white/15 outline-none focus:border-cyan-500/50 pr-8"
                    style={{ background: 'rgba(255,255,255,0.05)' }}
                  />
                  <Camera size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30" />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmitCatch}
              disabled={submitting}
              className="w-full py-3 rounded-xl font-bold text-black text-sm flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: 'linear-gradient(90deg, #00B4CC, #00E5FF)' }}
            >
              {submitting ? <Loader2 size={15} className="animate-spin text-black" /> : <><Send size={14} /> Fang einreichen</>}
            </button>
          </div>
        )}

        {/* My submissions */}
        {mySubmissions.length > 0 && (
          <div className="mb-4">
            <div className="text-sm font-bold text-white mb-2">Meine Einreichungen</div>
            {mySubmissions.slice(0, 3).map((s, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 px-3 rounded-xl border border-white/8 mb-2"
                style={{ background: 'rgba(15,30,45,0.6)' }}>
                <Fish size={14} className="text-cyan-400/60 shrink-0" />
                <div className="flex-1 text-sm text-white">
                  {s.species || 'Fisch'} · {s.length_cm || 0} cm
                  {s.weight_kg ? ` · ${s.weight_kg} kg` : ''}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-green-400">
                  <CheckCircle2 size={11} /> Bestätigt
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Leaderboard */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Crown size={15} className="text-amber-400" />
              <span className="text-sm font-bold text-white">Rangliste</span>
            </div>
            <span className="text-[11px] text-white/40">{leaderboard.length} Angler</span>
          </div>

          {leaderboard.length === 0 ? (
            <div className="rounded-2xl border border-white/8 p-6 text-center"
              style={{ background: 'rgba(15,30,45,0.75)' }}>
              <Trophy size={28} className="text-white/15 mx-auto mb-2" />
              <div className="text-sm text-white/30">Noch keine Einreichungen</div>
            </div>
          ) : (
            leaderboard.slice(0, 10).map((entry, i) => (
              <LeaderboardRow key={entry.user_id || i} rank={i + 1} entry={entry} />
            ))
          )}
        </div>

        {/* Invite section (organizer only) */}
        {canInvite && (
          <div
            className="rounded-2xl border border-white/10 p-4 mb-4"
            style={{ background: 'rgba(15,30,45,0.85)' }}
          >
            <div className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Send size={14} className="text-cyan-400" /> Teilnehmer einladen
            </div>
            <input
              type="text"
              placeholder="E-Mails, durch Komma getrennt"
              value={inviteEmails}
              onChange={e => setInviteEmails(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-white/25 border border-white/15 outline-none focus:border-cyan-500/50 mb-3"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            />
            <button
              type="button"
              onClick={handleInvite}
              disabled={inviting}
              className="w-full py-2.5 rounded-xl font-semibold text-sm text-white border border-cyan-500/30 flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: 'rgba(0,229,255,0.08)' }}
            >
              {inviting ? <Loader2 size={14} className="animate-spin" /> : <><Send size={13} /> Einladen</>}
            </button>
          </div>
        )}

        {/* Appeal section */}
        <div
          className="rounded-2xl border border-white/8 p-4"
          style={{ background: 'rgba(15,30,45,0.6)' }}
        >
          <div className="text-xs font-bold text-white/50 mb-1">Einspruch / Support</div>
          <div className="text-[11px] text-white/35 leading-relaxed mb-3">
            Bei Fragen zu Wertungen oder zur Fairness wende dich an den Veranstalter.
          </div>
          {event.contact_email ? (
            <a
              href={`mailto:${event.contact_email}`}
              className="text-[11px] text-cyan-400 underline"
            >
              {event.contact_email}
            </a>
          ) : (
            <div className="text-[11px] text-white/25">Kein Kontakt hinterlegt</div>
          )}
        </div>
      </div>
    </div>
  );
}
