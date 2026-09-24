import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { events } from '@/api/frontendClient';
import { auth } from '@/api/auth';
import { useEventActivityTracking } from '@/hooks/useEventActivityTracking';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Trophy,
  Users,
  Zap,
  Clock,
  Target,
  Send,
  Loader2,
  ChevronLeft,
  Camera,
  Mail,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useFeatureTracking } from '@/hooks/useFeatureTracking';
import PageTitle from "@/components/layout/PageTitle";

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
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const [submissionData, setSubmissionData] = useState({
    species: '',
    length_cm: '',
    weight_kg: '',
    photo_url: ''
  });

  useEffect(() => {
    loadData();
  }, [eventId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [user, eventData, participantsData, leaderboardData] = await Promise.all([
        auth.me(),
        events.get(eventId),
        events.participants(eventId),
        events.leaderboard(eventId)
      ]);

      setCurrentUser(user);
      setEvent(eventData);
      setParticipants(participantsData);
      setLeaderboard(leaderboardData);
      setIsParticipant(participantsData.some(p => p.user_id === user.email));
    } catch (error) {
      console.error('Fehler beim Laden des Events:', error);
      toast.error('Fehler beim Laden des Events');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinEvent = async () => {
    try {
      await events.join(eventId);
      toast.success('Du bist dem Event beigetreten!');
      await loadData();
    } catch (error) {
      console.error('Fehler beim Beitreten:', error);
      toast.error('Fehler beim Beitreten des Events');
    }
  };

  const handleSubmitCatch = async () => {
    if (!submissionData.species || !submissionData.length_cm) {
      toast.error('Art und Länge erforderlich');
      return;
    }

    try {
      setSubmitting(true);
      await events.submit(eventId, {
        species: submissionData.species,
        length_cm: parseFloat(submissionData.length_cm),
        weight_kg: submissionData.weight_kg ? parseFloat(submissionData.weight_kg) : null,
        photo_url: submissionData.photo_url || null,
        catch_time: new Date().toISOString()
      });

      trackCatchSubmission(eventId);
      toast.success('Fang erfolgreich eingereicht!');
      setSubmissionData({ species: '', length_cm: '', weight_kg: '', photo_url: '' });
      await loadData();
    } catch (error) {
      console.error('Fehler beim Einreichen:', error);
      toast.error('Fehler beim Einreichen des Fangs');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInvite = async () => {
    const emailList = inviteEmails
      .split(',')
      .map(e => e.trim())
      .filter(e => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    if (emailList.length === 0) {
      toast.error('Bitte gib gültige E-Mail-Adressen ein');
      return;
    }

    try {
      setInviting(true);
      await events.invite(eventId, emailList);
      toast.success(`${emailList.length} Einladung(en) versendet!`);
      setInviteEmails('');
      setShowInviteDialog(false);
    } catch (error) {
      console.error('Fehler beim Versenden von Einladungen:', error);
      toast.error('Fehler beim Versenden von Einladungen');
    } finally {
      setInviting(false);
    }
  };

  const getEventStatus = () => {
    if (!event) return '';
    const now = new Date();
    const endDate = new Date(event.end_date);
    if (endDate < now) return 'Beendet';
    const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
    return `${daysLeft} Tage verbleibend`;
  };

  const canInvite = event && currentUser && event.created_by === currentUser.email;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bb-bg)' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--bb-cyan)' }} />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="bb-page" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="bb-card text-center max-w-md w-full grid gap-4">
          <AlertCircle size={40} style={{ color: '#f87171', margin: '0 auto' }} />
          <p className="text-white text-lg">Event nicht gefunden</p>
          <button
            onClick={() => navigate('/events')}
            className="bb-action w-full flex items-center justify-center gap-2"
          >
            <ChevronLeft size={16} />
            Zurück zu Events
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bb-page">
      <button
        onClick={() => navigate('/events')}
        className="flex items-center gap-1 p-2 rounded-lg"
        style={{ color: 'var(--bb-muted)' }}
      >
        <ChevronLeft size={18} />
        Zurück
      </button>

      <div>
        <PageTitle title={event.name} subtitle={event.description || undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main Content */}
        <div className="lg:col-span-2 grid gap-5">
          {/* Event Info */}
          <div className="bb-card">
            <div className="bb-form-title mb-4">Event-Informationen</div>
            <div className="bb-stat-row mb-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="bb-stat-card">
                <div className="bb-stat-label">Status</div>
                <div className="text-white font-semibold text-sm flex items-center gap-1 mt-1">
                  <Clock size={14} style={{ color: 'var(--bb-cyan)' }} />
                  {getEventStatus()}
                </div>
              </div>
              <div className="bb-stat-card">
                <div className="bb-stat-label">Basispunkte</div>
                <div className="bb-stat-value" style={{ color: 'var(--bb-cyan)' }}>
                  {event.base_points || 100}
                </div>
              </div>
            </div>

            {event.target_species && (
              <div className="mb-4">
                <div className="bb-stat-label mb-1">Zielfisch</div>
                <p className="text-white font-semibold flex items-center gap-2">
                  <Target size={14} style={{ color: '#34d399' }} />
                  {event.target_species}
                </p>
              </div>
            )}

            {event.prize_description && (
              <div className="pt-3 mb-4" style={{ borderTop: '1px solid var(--bb-border)' }}>
                <div className="bb-stat-label mb-1">Preis</div>
                <p className="text-white text-sm">{event.prize_description}</p>
              </div>
            )}

            <div className="flex gap-2 pt-3" style={{ borderTop: '1px solid var(--bb-border)' }}>
              {!isParticipant && (
                <button onClick={handleJoinEvent} className="bb-action flex-1 flex items-center justify-center gap-2">
                  <CheckCircle2 size={16} />
                  Dem Event beitreten
                </button>
              )}
              {canInvite && (
                <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
                  <DialogTrigger asChild>
                    <button className="bb-secondary flex-1 flex items-center justify-center gap-2">
                      <Mail size={16} />
                      Einladungen senden
                    </button>
                  </DialogTrigger>
                  <DialogContent className="border-0" style={{ background: 'var(--bb-surface)', borderRadius: 16 }}>
                    <DialogHeader>
                      <DialogTitle className="text-white">User einladen</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4">
                      <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>
                        E-Mail-Adressen durch Kommas getrennt eingeben
                      </p>
                      <Input
                        placeholder="user1@example.com, user2@example.com"
                        value={inviteEmails}
                        onChange={(e) => setInviteEmails(e.target.value)}
                        className="bg-gray-900 border-gray-700 text-white"
                      />
                      <button
                        onClick={handleInvite}
                        disabled={inviting}
                        className="bb-action w-full flex items-center justify-center gap-2"
                      >
                        {inviting ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Wird versendet...
                          </>
                        ) : (
                          <>
                            <Send size={16} />
                            Einladungen senden
                          </>
                        )}
                      </button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          {/* Submit Catch */}
          {isParticipant && (
            <div className="bb-card" style={{ borderColor: 'rgba(52,211,153,.25)' }}>
              <div className="bb-form-title flex items-center gap-2 mb-4" style={{ color: '#34d399' }}>
                <Camera size={18} />
                Fang einreichen
              </div>
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--bb-muted)' }}>Fischart</label>
                    <Input
                      placeholder="z.B. Hecht"
                      value={submissionData.species}
                      onChange={(e) => setSubmissionData({ ...submissionData, species: e.target.value })}
                      className="bg-gray-900 border-gray-700 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--bb-muted)' }}>Länge (cm)</label>
                    <Input
                      type="number"
                      placeholder="z.B. 75"
                      step="0.5"
                      value={submissionData.length_cm}
                      onChange={(e) => setSubmissionData({ ...submissionData, length_cm: e.target.value })}
                      className="bg-gray-900 border-gray-700 text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--bb-muted)' }}>Gewicht (kg) - optional</label>
                  <Input
                    type="number"
                    placeholder="z.B. 3.5"
                    step="0.1"
                    value={submissionData.weight_kg}
                    onChange={(e) => setSubmissionData({ ...submissionData, weight_kg: e.target.value })}
                    className="bg-gray-900 border-gray-700 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--bb-muted)' }}>Foto-URL - optional</label>
                  <Input
                    placeholder="https://..."
                    value={submissionData.photo_url}
                    onChange={(e) => setSubmissionData({ ...submissionData, photo_url: e.target.value })}
                    className="bg-gray-900 border-gray-700 text-white"
                  />
                </div>
                <button
                  onClick={handleSubmitCatch}
                  disabled={submitting}
                  className="bb-action w-full flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Wird eingereicht...
                    </>
                  ) : (
                    <>
                      <Camera size={16} />
                      Fang einreichen
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Leaderboard */}
          <div className="bb-card">
            <div className="flex items-center gap-2 mb-4">
              <Trophy size={18} style={{ color: '#fbbf24' }} />
              <div className="text-lg font-bold text-white">Event-Leaderboard</div>
            </div>
            {leaderboard.length > 0 ? (
              <div className="grid gap-2">
                {leaderboard.map((entry, index) => {
                  const isMe = entry.user_id === currentUser?.email;
                  const rank = index + 1;
                  const rankColors = { 1: '#fbbf24', 2: '#94a3b8', 3: '#fb923c' };
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 p-3 rounded-xl"
                      style={{
                        background: isMe ? 'rgba(0,229,255,.08)' : 'rgba(0,0,0,.2)',
                        border: isMe ? '1px solid rgba(0,229,255,.3)' : '1px solid var(--bb-border)',
                      }}
                    >
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(255,255,255,.06)', color: rankColors[rank] || 'var(--bb-muted)' }}>
                        {rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {isMe ? 'Du' : entry.user_id.split('@')[0]}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>
                          {entry.submission_count} Einreichung{entry.submission_count !== 1 ? 'en' : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold" style={{ color: 'var(--bb-cyan)' }}>
                          {Math.round(entry.total_points * 100) / 100}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>Punkte</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center py-6" style={{ color: 'var(--bb-muted)' }}>Noch keine Einreichungen</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="grid gap-5 content-start">
          {/* Participants */}
          <div className="bb-card" style={{ borderColor: 'rgba(96,165,250,.2)' }}>
            <div className="flex items-center gap-2 mb-3">
              <Users size={18} style={{ color: '#60a5fa' }} />
              <div className="font-bold text-white">Teilnehmer</div>
            </div>
            <div className="grid gap-2 max-h-64 overflow-y-auto">
              {participants.map((p) => (
                <div
                  key={p.user_id}
                  className="p-2 rounded-xl"
                  style={{ background: 'rgba(96,165,250,.08)', border: '1px solid rgba(96,165,250,.2)' }}
                >
                  <p className="text-sm text-white font-medium">
                    {p.user_id === currentUser?.email ? 'Du (Organisator)' : p.user_id.split('@')[0]}
                  </p>
                  <p className="text-xs" style={{ color: '#60a5fa' }}>
                    {Math.round(p.total_points * 100) / 100} Punkte
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs font-semibold mt-3 text-center" style={{ color: '#60a5fa' }}>
              {participants.length} Teilnehmer
            </p>
          </div>

          {/* Points Info */}
          <div className="bb-card">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={18} style={{ color: 'var(--bb-cyan)' }} />
              <div className="font-bold text-white">Punkte-Info</div>
            </div>
            <div className="grid gap-3 text-sm">
              {[
                { title: 'Basispunkte', desc: '+100 für jede Einreichung' },
                { title: 'Längenboni', desc: '+5 Punkte pro cm' },
                { title: 'Like-Punkte', desc: '+1 Punkt pro Community-Like' },
              ].map(item => (
                <div key={item.title}>
                  <p className="font-semibold text-white text-xs">{item.title}</p>
                  <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
