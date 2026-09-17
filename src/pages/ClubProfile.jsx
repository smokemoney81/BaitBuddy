import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/api/frontendClient';
import { auth } from '@/api/auth';
import { toast } from 'sonner';
import {
  ChevronLeft, Users, MapPin, Calendar, Fish, Phone,
  Mail, Globe, CheckCircle, ChevronRight, Loader2,
  Shield, Bell, BellOff
} from 'lucide-react';

const TABS = [
  { id: 'gewaesser', label: 'Gewässer' },
  { id: 'regeln', label: 'Regeln' },
  { id: 'veranstaltungen', label: 'Veranstaltungen' },
  { id: 'kontakt', label: 'Kontakt' },
];

export default function ClubProfile() {
  const { clubId } = useParams();
  const navigate = useNavigate();
  const [club, setClub] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('gewaesser');

  useEffect(() => { loadData(); }, [clubId]);

  const loadData = async () => {
    try {
      const [clubData, eventsData, user] = await Promise.all([
        api.get(`/api/clubs/${clubId}`).catch(() => null),
        api.get(`/api/clubs/${clubId}/events`).catch(() => []),
        auth.me().catch(() => null),
      ]);
      setClub(clubData);
      setEvents(Array.isArray(eventsData) ? eventsData : []);
      if (user && clubData?.followers) {
        setFollowing(clubData.followers.includes(user.email));
      }
    } catch {
      toast.error('Fehler beim Laden des Vereinsprofils');
    } finally {
      setLoading(false);
    }
  };

  const handleFollow = async () => {
    try {
      setFollowLoading(true);
      if (following) {
        await api.delete(`/api/clubs/${clubId}/follow`);
        setFollowing(false);
        toast.success('Verein nicht mehr gefolgt');
      } else {
        await api.post(`/api/clubs/${clubId}/follow`);
        setFollowing(true);
        toast.success('Verein gefolgt');
      }
    } catch { toast.error('Fehler'); }
    finally { setFollowLoading(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#080F16' }}>
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  if (!club) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#080F16' }}>
        <div className="text-center">
          <Shield size={40} className="text-white/20 mx-auto mb-3" />
          <div className="text-white font-bold mb-4">Verein nicht gefunden</div>
          <button type="button" onClick={() => navigate(-1)}
            className="px-5 py-2.5 rounded-xl font-semibold text-black text-sm"
            style={{ background: '#00E5FF' }}>
            Zurück
          </button>
        </div>
      </div>
    );
  }

  const waters = Array.isArray(club.waters) ? club.waters : [];
  const rules = Array.isArray(club.rules) ? club.rules : [];
  const contact = club.contact || {};

  return (
    <div className="min-h-screen" style={{ background: '#080F16', color: '#eef5fa' }}>
      {/* Hero */}
      <div
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #0A2030 0%, #071520 60%, #080F16 100%)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 65% 25%, rgba(0,180,255,0.10) 0%, transparent 60%)' }} />

        <div className="relative flex items-center justify-between px-4 pt-4 pb-3">
          <button type="button" onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center border border-white/15 bg-white/5">
            <ChevronLeft size={20} className="text-white/80" />
          </button>
          {club.verified && (
            <div className="px-3 py-1 rounded-full text-[10px] font-bold text-cyan-400 flex items-center gap-1"
              style={{ background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)' }}>
              <CheckCircle size={9} /> Verifiziert
            </div>
          )}
        </div>

        {/* Club avatar + name */}
        <div className="relative px-4 pt-2 pb-6 flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl border-2 border-cyan-500/40 flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #0a2030, #051018)' }}>
            {club.logo_url ? (
              <img src={club.logo_url} alt={club.name} className="w-full h-full object-cover rounded-2xl" />
            ) : (
              <Fish size={28} className="text-cyan-400/50" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-xl font-extrabold text-white leading-tight">{club.name}</h1>
            </div>
            {club.description && (
              <p className="text-[12px] text-white/50 leading-relaxed line-clamp-2">{club.description}</p>
            )}
          </div>
        </div>
      </div>

      <div className="px-4" style={{ paddingBottom: 'calc(100px + env(safe-area-inset-bottom))' }}>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-4 -mt-2">
          {[
            { icon: Users, label: 'Mitglieder', value: club.member_count || 0, color: '#00E5FF' },
            { icon: Calendar, label: 'Seit', value: club.founded_year || '–', color: '#00FF9D' },
            { icon: MapPin, label: 'Hauptgewässer', value: club.main_water || '–', color: '#FF9F0A' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="rounded-2xl border border-white/8 p-3 text-center"
              style={{ background: 'rgba(15,30,45,0.85)' }}>
              <Icon size={16} className="mx-auto mb-1" style={{ color }} />
              <div className="text-sm font-extrabold text-white">{value}</div>
              <div className="text-[9px] text-white/40">{label}</div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={handleFollow}
            disabled={followLoading}
            className="flex-1 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
            style={following
              ? { background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)', color: '#00E5FF' }
              : { background: 'linear-gradient(90deg, #00B4CC, #00E5FF)', color: '#000' }
            }
          >
            {followLoading ? <Loader2 size={15} className="animate-spin" /> : (
              <>
                {following ? <BellOff size={15} /> : <Bell size={15} />}
                {following ? 'Gefolgt' : 'Verein folgen'}
              </>
            )}
          </button>
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="flex-1 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 border border-white/15"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#eef5fa' }}
            >
              <Mail size={15} /> Kontakt
            </a>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-[12px] font-semibold whitespace-nowrap shrink-0 transition-all ${
                activeTab === tab.id ? 'text-black' : 'text-white/60 border border-white/15'
              }`}
              style={activeTab === tab.id ? { background: '#00E5FF' } : { background: 'rgba(255,255,255,0.05)' }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'gewaesser' && (
          <div>
            {waters.length === 0 ? (
              <div className="rounded-2xl border border-white/8 p-6 text-center"
                style={{ background: 'rgba(15,30,45,0.75)' }}>
                <MapPin size={28} className="text-white/15 mx-auto mb-2" />
                <div className="text-sm text-white/30">Keine Gewässer hinterlegt</div>
              </div>
            ) : waters.map((water, i) => (
              <div key={i} className="rounded-2xl border border-white/8 p-4 mb-3"
                style={{ background: 'rgba(15,30,45,0.85)' }}>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl border border-cyan-500/30 flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(0,229,255,0.08)' }}>
                    <MapPin size={16} className="text-cyan-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-white">{water.name}</div>
                    {water.size && <div className="text-[11px] text-white/40">{water.size}</div>}
                  </div>
                </div>
                {water.species && water.species.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {water.species.map(s => (
                      <span key={s} className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-cyan-400 border border-cyan-500/30"
                        style={{ background: 'rgba(0,229,255,0.08)' }}>
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                {water.notes && (
                  <div className="mt-2 text-[11px] text-white/50 leading-relaxed">{water.notes}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'regeln' && (
          <div className="rounded-2xl border border-white/8 p-4"
            style={{ background: 'rgba(15,30,45,0.85)' }}>
            {rules.length === 0 ? (
              <div className="text-sm text-white/30 text-center py-4">Keine Regeln hinterlegt</div>
            ) : (
              <ul className="space-y-3">
                {rules.map((rule, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full border border-amber-400/50 flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: 'rgba(255,160,0,0.1)' }}>
                      <span className="text-[9px] font-bold text-amber-400">{i + 1}</span>
                    </div>
                    <div>
                      {rule.title && <div className="text-sm font-bold text-white mb-0.5">{rule.title}</div>}
                      <div className="text-[11px] text-white/55 leading-relaxed">{rule.text || rule}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === 'veranstaltungen' && (
          <div>
            {events.length === 0 ? (
              <div className="rounded-2xl border border-white/8 p-6 text-center"
                style={{ background: 'rgba(15,30,45,0.75)' }}>
                <Calendar size={28} className="text-white/15 mx-auto mb-2" />
                <div className="text-sm text-white/30">Keine Veranstaltungen geplant</div>
              </div>
            ) : events.map(evt => (
              <button
                key={evt.id}
                type="button"
                onClick={() => navigate(`/events/${evt.id}`)}
                className="w-full rounded-2xl border border-white/8 p-4 mb-3 text-left"
                style={{ background: 'rgba(15,30,45,0.85)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-bold text-white leading-tight">{evt.name}</div>
                  <ChevronRight size={15} className="text-white/30 shrink-0" />
                </div>
                <div className="flex flex-wrap gap-3">
                  {evt.start_date && (
                    <div className="flex items-center gap-1 text-[11px] text-white/50">
                      <Calendar size={10} className="text-cyan-400" />
                      {new Date(evt.start_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </div>
                  )}
                  {evt.location && (
                    <div className="flex items-center gap-1 text-[11px] text-white/50">
                      <MapPin size={10} className="text-cyan-400" /> {evt.location}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {activeTab === 'kontakt' && (
          <div className="rounded-2xl border border-white/8 p-4 space-y-4"
            style={{ background: 'rgba(15,30,45,0.85)' }}>
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="flex items-center gap-3 group">
                <div className="w-9 h-9 rounded-xl border border-white/15 flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <Phone size={15} className="text-cyan-400" />
                </div>
                <div>
                  <div className="text-[10px] text-white/40">Telefon</div>
                  <div className="text-sm font-semibold text-white group-hover:text-cyan-400">{contact.phone}</div>
                </div>
              </a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="flex items-center gap-3 group">
                <div className="w-9 h-9 rounded-xl border border-white/15 flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <Mail size={15} className="text-cyan-400" />
                </div>
                <div>
                  <div className="text-[10px] text-white/40">E-Mail</div>
                  <div className="text-sm font-semibold text-white group-hover:text-cyan-400">{contact.email}</div>
                </div>
              </a>
            )}
            {contact.website && (
              <a href={contact.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 group">
                <div className="w-9 h-9 rounded-xl border border-white/15 flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <Globe size={15} className="text-cyan-400" />
                </div>
                <div>
                  <div className="text-[10px] text-white/40">Website</div>
                  <div className="text-sm font-semibold text-white group-hover:text-cyan-400">{contact.website}</div>
                </div>
              </a>
            )}
            {contact.address && (
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl border border-white/15 flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <MapPin size={15} className="text-cyan-400" />
                </div>
                <div>
                  <div className="text-[10px] text-white/40">Adresse</div>
                  <div className="text-sm font-semibold text-white whitespace-pre-line">{contact.address}</div>
                </div>
              </div>
            )}
            {!contact.phone && !contact.email && !contact.website && !contact.address && (
              <div className="text-sm text-white/30 text-center py-4">Keine Kontaktdaten hinterlegt</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
