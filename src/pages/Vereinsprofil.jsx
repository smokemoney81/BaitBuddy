import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Users, Trophy, MapPin, UserPlus, UserCheck, Mail, Phone, Globe, Waves, FileText, CalendarDays,
  PlusCircle, ChevronRight, AlertTriangle, BadgeCheck, Search, Loader2, Pencil, Clock, Shield,
} from 'lucide-react';
import PageTitle from '@/components/layout/PageTitle';
import { clubs as clubsApi } from '@/api/frontendClient';
import { useAuth } from '@/lib/AuthContext';
import { loadClubDirectory, searchDirectory } from '@/lib/clubDirectory';
import { fishImageFor } from '@/lib/fishImages';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const SECTIONS = [
  { id: 'gewaesser', label: 'Gewässer', icon: Waves },
  { id: 'regeln', label: 'Regeln', icon: FileText },
  { id: 'veranstaltungen', label: 'Veranstaltungen', icon: CalendarDays },
  { id: 'kontakt', label: 'Kontakt', icon: Users },
];

function crestInitials(name) {
  return String(name || '').replace(/e\.\s?V\./i, '').split(/\s+/).filter(w => /^[A-ZÄÖÜ]/.test(w)).map(w => w[0]).join('').slice(0, 3) || 'AV';
}

function hrefFor(website) {
  if (!website) return null;
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

function formatEventDate(value) {
  const d = value ? new Date(value) : null;
  return d ? { day: d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '').toUpperCase(), num: d.getDate(), month: d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '').toUpperCase() } : null;
}

function watersToText(waters) {
  return (waters || []).map(w => [w.name, w.region || '', (w.species || []).join(', ')].join(' | ')).join('\n');
}

function textToWaters(text) {
  return String(text || '').split('\n').map(line => line.trim()).filter(Boolean).map(line => {
    const [name, region, species] = line.split('|').map(part => (part || '').trim());
    return { name, region: region || null, species: (species || '').split(',').map(s => s.trim()).filter(Boolean) };
  });
}

function ClubSearch() {
  const [directory, setDirectory] = useState(null);
  const [query, setQuery] = useState('');
  const { isAuthenticated } = useAuth();
  const [following, setFollowing] = useState([]);

  useEffect(() => { loadClubDirectory().then(setDirectory).catch(() => setDirectory([])); }, []);
  useEffect(() => {
    if (isAuthenticated) clubsApi.following().then(list => setFollowing(Array.isArray(list) ? list : [])).catch(() => {});
  }, [isAuthenticated]);

  const results = useMemo(() => (directory ? searchDirectory(directory, query) : []), [directory, query]);

  return (
    <div className="bb-page bb-club">
      <PageTitle title="Angelvereine" subtitle="Finde deinen Verein: Gewässer, Regeln, Veranstaltungen und Kontakt." />
      {following.length > 0 && (
        <section aria-labelledby="club-following">
          <h2 id="club-following" className="bb-section-title mb-2">Vereine, denen du folgst</h2>
          <ul className="bb-club-results">
            {following.map(club => (
              <li key={club.id}>
                <Link to={`/Vereinsprofil?id=${club.id}`}>
                  <span className="bb-club-mini-crest">{crestInitials(club.name)}</span>
                  <span className="min-w-0 flex-1"><strong>{club.name}</strong><small>{club.city || ''}</small></span>
                  {club.verified && <BadgeCheck size={18} aria-label="Verifiziert" className="text-[var(--bb-green)]" />}
                  <ChevronRight size={18} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <label className="bb-club-search">
        <Search size={20} aria-hidden="true" />
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Verein, Ort oder PLZ" aria-label="Verein suchen" />
      </label>
      {!directory ? (
        <div className="grid place-items-center py-10"><Loader2 className="w-7 h-7 animate-spin text-cyan-300" aria-label="Lädt" /></div>
      ) : (
        <ul className="bb-club-results">
          {results.map(entry => (
            <li key={entry.ref}>
              <Link to={`/Vereinsprofil?ref=${encodeURIComponent(entry.ref)}`}>
                <span className="bb-club-mini-crest">{crestInitials(entry.name)}</span>
                <span className="min-w-0 flex-1"><strong>{entry.name}</strong><small>{[entry.postal_code, entry.city].filter(Boolean).join(' ')}</small></span>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            </li>
          ))}
          {results.length === 0 && <li className="bb-card text-sm text-slate-300">Kein Verein gefunden.</li>}
        </ul>
      )}
    </div>
  );
}

function EditDialog({ open, onOpenChange, initial, onSave, saving, claiming }) {
  const [draft, setDraft] = useState(initial);
  useEffect(() => { if (open) setDraft(initial); }, [open, initial]);
  const set = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  const field = (key, label, props = {}) => (
    <label className="bb-club-field">
      <small>{label}</small>
      <input value={draft[key] ?? ''} onChange={e => set(key, e.target.value)} {...props} />
    </label>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bb-app border-0 max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{claiming ? 'Vereinsprofil übernehmen' : 'Vereinsprofil bearbeiten'}</DialogTitle>
          <DialogDescription>
            {claiming ? 'Du wirst Verwalter dieses Profils. Das Häkchen „Verifiziert“ vergibt das BaitBuddy-Team nach Prüfung.' : 'Alle Angaben sind öffentlich sichtbar.'}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={e => { e.preventDefault(); onSave(draft); }}>
          {field('name', 'Name', { required: true, maxLength: 120 })}
          {field('motto', 'Leitsatz', { maxLength: 200 })}
          <label className="bb-club-field"><small>Beschreibung</small><textarea rows={3} maxLength={1500} value={draft.description ?? ''} onChange={e => set('description', e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-3">
            {field('founded_year', 'Gegründet', { type: 'number', min: 1800, max: new Date().getFullYear() })}
            {field('member_count', 'Mitglieder', { type: 'number', min: 0 })}
          </div>
          {field('home_water', 'Hauptgewässer', { maxLength: 120 })}
          <label className="bb-club-field">
            <small>Gewässer (eine Zeile je Gewässer: Name | Region | Fischarten mit Komma)</small>
            <textarea rows={3} value={draft.watersText ?? ''} onChange={e => set('watersText', e.target.value)} placeholder="Möhnesee | NRW | Zander, Hecht, Barsch" />
          </label>
          <label className="bb-club-field">
            <small>Regeln (eine je Zeile)</small>
            <textarea rows={4} value={draft.rulesText ?? ''} onChange={e => set('rulesText', e.target.value)} placeholder="Nur mit gültigem Vereinsausweis angeln" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {field('phone', 'Telefon', { type: 'tel' })}
            {field('email', 'E-Mail', { type: 'email' })}
          </div>
          {field('website', 'Website')}
          {field('logo_url', 'Logo (Link zu einem Bild)')}
          {field('street', 'Straße')}
          <div className="grid grid-cols-2 gap-3">
            {field('postal_code', 'PLZ')}
            {field('city', 'Ort')}
          </div>
          <button type="submit" className="bb-action bb-action-block" disabled={saving}>
            {saving ? <Loader2 size={18} aria-hidden="true" className="animate-spin" /> : <Pencil size={18} aria-hidden="true" />}<span>Speichern</span>
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ClubProfile({ id, reference }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [club, setClub] = useState(null);
  const [directoryEntry, setDirectoryEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const key = id || reference;
    const [profile, directory] = await Promise.all([
      clubsApi.get(key).catch(() => null),
      reference ? loadClubDirectory().catch(() => []) : Promise.resolve([]),
    ]);
    setClub(profile && typeof profile === 'object' && profile.id ? profile : null);
    const ref = reference || profile?.external_ref;
    if (ref) {
      const dir = directory.length ? directory : await loadClubDirectory().catch(() => []);
      setDirectoryEntry(dir.find(e => e.ref === ref) || null);
    }
    setLoading(false);
  }, [id, reference]);

  useEffect(() => { load(); }, [load]);

  const base = directoryEntry || {};
  const data = { ...base, ...Object.fromEntries(Object.entries(club || {}).filter(([, v]) => v !== null && v !== undefined && v !== '')) };
  const name = data.name;

  const toggleFollow = async () => {
    if (!isAuthenticated) { navigate('/Home'); return; }
    setBusy(true);
    try {
      if (club?.is_following) {
        await clubsApi.unfollow(club.id);
        toast.success('Du folgst dem Verein nicht mehr.');
      } else {
        await clubsApi.follow(club?.id || reference, club ? undefined : {
          name: base.name, city: base.city, street: base.street, postal_code: base.postal_code,
          phone: base.phone, email: base.email, website: base.website, latitude: base.latitude, longitude: base.longitude,
        });
        toast.success('Du folgst jetzt diesem Verein.');
      }
      await load();
    } catch (error) {
      toast.error(error?.data?.error || 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };

  const save = async (draft) => {
    setSaving(true);
    const payload = {
      name: draft.name, motto: draft.motto, description: draft.description, home_water: draft.home_water,
      founded_year: draft.founded_year === '' ? null : draft.founded_year, member_count: draft.member_count === '' ? null : draft.member_count,
      phone: draft.phone, email: draft.email, website: draft.website, logo_url: draft.logo_url,
      street: draft.street, postal_code: draft.postal_code, city: draft.city,
      rules: String(draft.rulesText || '').split('\n').map(r => r.trim()).filter(Boolean),
      waters: textToWaters(draft.watersText),
    };
    try {
      if (club?.is_admin) await clubsApi.update(club.id, payload);
      else await clubsApi.create({ ...payload, external_ref: reference || club?.external_ref || undefined, latitude: base.latitude, longitude: base.longitude });
      toast.success('Vereinsprofil gespeichert.');
      setEditing(false);
      await load();
    } catch (error) {
      toast.error(error?.data?.error || 'Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  const editInitial = useMemo(() => ({
    name: data.name || '', motto: data.motto || '', description: data.description || '', home_water: data.home_water || '',
    founded_year: data.founded_year ?? '', member_count: data.member_count ?? '', phone: data.phone || '', email: data.email || '',
    website: data.website || '', logo_url: data.logo_url || '', street: data.street || '', postal_code: data.postal_code || '', city: data.city || '',
    rulesText: (Array.isArray(data.rules) ? data.rules : []).join('\n'), watersText: watersToText(Array.isArray(data.waters) ? data.waters : []),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [club, directoryEntry]);

  if (loading) return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="w-8 h-8 animate-spin text-cyan-300" aria-label="Lädt" /></div>;

  if (!name) {
    return (
      <div className="bb-page">
        <PageTitle title="Vereinsprofil" />
        <div className="bb-card text-center">
          <p className="text-slate-200">Diesen Verein gibt es nicht (mehr).</p>
          <Link to="/Vereinsprofil" className="bb-action mt-4 inline-flex">Vereine durchsuchen</Link>
        </div>
      </div>
    );
  }

  const waters = Array.isArray(data.waters) ? data.waters : [];
  const rules = Array.isArray(data.rules) ? data.rules : [];
  const events = Array.isArray(club?.events) ? club.events : [];
  const address = [data.street, [data.postal_code, data.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const mapsHref = data.latitude != null ? `https://maps.google.com/?q=${data.latitude},${data.longitude}` : address ? `https://maps.google.com/?q=${encodeURIComponent(`${name}, ${address}`)}` : null;
  const canManage = club?.is_admin || (isAuthenticated && !club?.claimed);
  const scrollTo = (sectionId) => document.getElementById(`club-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="bb-page bb-club">
      <PageTitle title="Vereinsprofil" />

      <section className="bb-club-hero">
        <span className="bb-club-crest">
          {data.logo_url ? <img src={data.logo_url} alt={`Logo ${name}`} /> : <span>{crestInitials(name)}</span>}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="bb-club-name">
            {name}
            {data.verified && <span className="bb-club-verified"><BadgeCheck size={16} aria-hidden="true" />Verifiziert</span>}
          </h2>
          {(data.motto || data.description) && <p className="bb-club-motto">{data.motto || data.description}</p>}
        </div>
      </section>

      <div className="bb-club-stats">
        <span><Users size={22} aria-hidden="true" /><strong>{data.member_count != null ? data.member_count.toLocaleString('de-DE') : (club?.follower_count ?? 0)}</strong><small>{data.member_count != null ? 'Mitglieder' : 'Folgen in BaitBuddy'}</small></span>
        {data.founded_year && <span><Trophy size={22} aria-hidden="true" /><strong>Seit {data.founded_year}</strong><small>Tradition</small></span>}
        {(data.home_water || data.city) && <span><MapPin size={22} aria-hidden="true" /><strong>{data.home_water || data.city}</strong><small>{data.home_water ? 'Hauptgewässer' : 'Ort'}</small></span>}
      </div>

      <div className="bb-club-actions">
        <button type="button" className={club?.is_following ? 'bb-secondary bb-club-follow' : 'bb-action bb-club-follow'} onClick={toggleFollow} disabled={busy}>
          {club?.is_following ? <UserCheck size={20} aria-hidden="true" /> : <UserPlus size={20} aria-hidden="true" />}
          {club?.is_following ? 'Du folgst' : 'Verein folgen'}
        </button>
        <button type="button" className="bb-secondary bb-club-follow" onClick={() => scrollTo('kontakt')}><Mail size={20} aria-hidden="true" />Kontakt</button>
      </div>

      <nav className="bb-club-tabs" aria-label="Abschnitte">
        {SECTIONS.map(section => (
          <button key={section.id} type="button" onClick={() => scrollTo(section.id)}><section.icon size={18} aria-hidden="true" />{section.label}</button>
        ))}
      </nav>

      <section id="club-gewaesser" className="bb-card bb-club-card">
        <h2 className="bb-club-card-title"><Waves size={22} aria-hidden="true" />Gewässer</h2>
        {waters.length ? waters.map(water => (
          <div key={water.name} className="bb-club-water">
            <strong>{water.name}</strong>
            {water.region && <small><MapPin size={14} aria-hidden="true" />{water.region}</small>}
            {water.species?.length > 0 && (
              <ul className="bb-club-species">
                {water.species.map(species => {
                  const image = fishImageFor(species);
                  return <li key={species}>{image && <img src={image} alt="" />}{species}</li>;
                })}
              </ul>
            )}
          </div>
        )) : <p className="bb-club-empty">Der Verein hat noch keine Gewässer eingetragen.</p>}
      </section>

      <section id="club-regeln" className="bb-card bb-club-card">
        <h2 className="bb-club-card-title"><FileText size={22} aria-hidden="true" />Regeln</h2>
        {rules.length ? (
          <div className="bb-card-warn bb-club-rules">
            <AlertTriangle size={32} aria-hidden="true" />
            <ul>{rules.map(rule => <li key={rule}>{rule}</li>)}</ul>
          </div>
        ) : <p className="bb-club-empty">Keine Vereinsregeln hinterlegt – es gelten die gesetzlichen Vorschriften und die Erlaubnisschein-Bedingungen.</p>}
      </section>

      <section id="club-veranstaltungen" className="bb-card bb-club-card">
        <div className="bb-club-card-head">
          <h2 className="bb-club-card-title"><CalendarDays size={22} aria-hidden="true" />Veranstaltungen</h2>
          {club?.is_admin && <Link to={`/events/create?club=${club.id}`} className="bb-club-create"><PlusCircle size={18} aria-hidden="true" />Event erstellen</Link>}
        </div>
        {events.length ? events.map(event => {
          const date = formatEventDate(event.start_date);
          return (
            <Link key={event.id} to={`/events/${event.id}`} className="bb-club-event">
              {date && <span className="bb-club-date"><small>{date.day}</small><strong>{date.num}</strong><small>{date.month}</small></span>}
              <span className="min-w-0 flex-1">
                <strong>{event.name}</strong>
                <small><Clock size={13} aria-hidden="true" />{new Date(event.start_date).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} – {new Date(event.end_date).toLocaleDateString('de-DE')}</small>
                <small><Users size={13} aria-hidden="true" />{event.participant_count} Teilnehmer</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          );
        }) : <p className="bb-club-empty">Keine anstehenden Veranstaltungen.</p>}
      </section>

      <section id="club-kontakt" className="bb-card bb-club-card">
        <h2 className="bb-club-card-title"><Users size={22} aria-hidden="true" />Kontakt</h2>
        <div className="bb-club-contact">
          {data.phone && <a href={`tel:${data.phone.replace(/[^\d+]/g, '')}`}><Phone size={20} aria-hidden="true" /><strong>Anrufen</strong><small>{data.phone}</small></a>}
          {data.email && <a href={`mailto:${data.email}`}><Mail size={20} aria-hidden="true" /><strong>E-Mail</strong><small>{data.email}</small></a>}
          {data.website && <a href={hrefFor(data.website)} target="_blank" rel="noopener noreferrer"><Globe size={20} aria-hidden="true" /><strong>Website</strong><small>{data.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</small></a>}
          {address && <a href={mapsHref} target="_blank" rel="noopener noreferrer"><MapPin size={20} aria-hidden="true" /><strong>Adresse</strong><small>{address}</small></a>}
        </div>
        {!data.phone && !data.email && !data.website && !address && <p className="bb-club-empty">Keine Kontaktdaten hinterlegt.</p>}
      </section>

      {canManage && (
        <section className="bb-card bb-club-manage">
          <Shield size={26} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <strong>{club?.is_admin ? 'Du verwaltest dieses Profil' : 'Du bist im Vorstand?'}</strong>
            <small>{club?.is_admin ? 'Gewässer, Regeln und Kontakt aktuell halten.' : 'Übernimm das Profil und pflege Gewässer, Regeln und Veranstaltungen.'}</small>
          </span>
          <button type="button" className="bb-comp-chip-btn" onClick={() => setEditing(true)}>{club?.is_admin ? 'Bearbeiten' : 'Übernehmen'}</button>
        </section>
      )}

      <EditDialog open={editing} onOpenChange={setEditing} initial={editInitial} onSave={save} saving={saving} claiming={!club?.is_admin} />
    </div>
  );
}

export default function Vereinsprofil() {
  const [params] = useSearchParams();
  const id = params.get('id');
  const reference = params.get('ref');
  if (!id && !reference) return <ClubSearch />;
  return <ClubProfile key={id || reference} id={id} reference={reference} />;
}
