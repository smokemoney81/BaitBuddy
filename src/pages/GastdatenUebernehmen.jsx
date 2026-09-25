import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Database, UserPlus, User, Fish, MapPin, CheckCircle2, ShieldCheck, FileSearch, ArrowRight,
  Lock, Trash2, Loader2, RefreshCw, BookOpen,
} from 'lucide-react';
import PageTitle from '@/components/layout/PageTitle';
import { useAuth } from '@/lib/AuthContext';
import { entities } from '@/api/frontendClient';
import {
  guestDataSummary, guestList, guestDelete, migrateGuestData, isGuestMigrationRunning,
  readGuestMigrationResult, GUEST_MIGRATION_EVENT,
} from '@/lib/guestStore';

const STEPS = ['Konto erstellen', 'Daten prüfen', 'Übernehmen', 'Fertig'];

const TILES = [
  { entity: 'Catch', icon: Fish, one: 'Fang', many: 'Fänge', text: 'Deine Fangdaten', tone: 'green' },
  { entity: 'Spot', icon: MapPin, one: 'Spot', many: 'Spots', text: 'Gespeicherte Angelplätze', tone: 'cyan' },
];

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '';
}

function recordLabel(entity, record) {
  if (entity === 'Catch') {
    return {
      title: [record.species || 'Fang', record.length_cm ? `${record.length_cm} cm` : null].filter(Boolean).join(' · '),
      detail: [formatDate(record.catch_time || record.created_date), record.bait_used].filter(Boolean).join(' · '),
    };
  }
  const lat = Number(record.latitude);
  const lon = Number(record.longitude);
  return {
    title: record.name || 'Spot',
    detail: Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(4)}, ${lon.toFixed(4)}` : formatDate(record.created_date),
  };
}

function Stepper({ current }) {
  return (
    <ol className="bb-guest-steps" aria-label="Fortschritt">
      {STEPS.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'active' : 'idle';
        return (
          <li key={label} className={`is-${state}`} aria-current={state === 'active' ? 'step' : undefined}>
            <span className="bb-guest-step-dot">{state === 'done' ? <CheckCircle2 size={20} aria-hidden="true" /> : index + 1}</span>
            <span className="bb-guest-step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function ReviewList({ onChange }) {
  const [confirmId, setConfirmId] = useState(null);
  const groups = TILES.map(tile => ({ ...tile, records: guestList(tile.entity) })).filter(group => group.records.length);

  const remove = (entity, id) => {
    if (confirmId !== id) { setConfirmId(id); return; }
    guestDelete(entity, id);
    setConfirmId(null);
    onChange();
  };

  return (
    <div className="bb-guest-review">
      {groups.map(group => (
        <section key={group.entity}>
          <h3 className="bb-guest-review-head"><group.icon size={18} aria-hidden="true" />{group.many}</h3>
          <ul>
            {group.records.map(record => {
              const label = recordLabel(group.entity, record);
              const confirming = confirmId === record.id;
              return (
                <li key={record.id}>
                  <span className="min-w-0 flex-1">
                    <strong>{label.title}</strong>
                    {label.detail && <small>{label.detail}</small>}
                  </span>
                  <button
                    type="button"
                    className={`bb-guest-remove${confirming ? ' is-confirm' : ''}`}
                    onClick={() => remove(group.entity, record.id)}
                    aria-label={confirming ? `${label.title} endgültig entfernen` : `${label.title} nicht übernehmen`}
                  >
                    <Trash2 size={16} aria-hidden="true" />{confirming ? 'Entfernen?' : ''}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="bb-guest-hint">Entfernte Einträge werden nicht übernommen und von diesem Gerät gelöscht.</p>
    </div>
  );
}

export default function GastdatenUebernehmen() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const [summary, setSummary] = useState(() => guestDataSummary());
  const [result, setResult] = useState(() => readGuestMigrationResult());
  const [running, setRunning] = useState(() => isGuestMigrationRunning());
  const [reviewing, setReviewing] = useState(false);

  const refresh = useCallback(() => {
    setSummary(guestDataSummary());
    setResult(readGuestMigrationResult());
    setRunning(isGuestMigrationRunning());
  }, []);

  useEffect(() => {
    // Die automatische Übernahme nach der Anmeldung läuft in AuthContext; ihr
    // Ergebnis kommt als Event an.
    window.addEventListener(GUEST_MIGRATION_EVENT, refresh);
    const poll = setInterval(refresh, 1500);
    return () => { window.removeEventListener(GUEST_MIGRATION_EVENT, refresh); clearInterval(poll); };
  }, [refresh]);

  const transferNow = async () => {
    setRunning(true);
    try {
      const outcome = await migrateGuestData(entities);
      if (outcome.failed > 0) toast.error(`${outcome.failed} Einträge konnten nicht übernommen werden. Versuche es später erneut.`);
      else if (outcome.migrated > 0) toast.success('Gastdaten übernommen.');
    } finally {
      refresh();
    }
  };

  const hasData = summary.total > 0;
  const step = !isAuthenticated ? (reviewing ? 1 : 0) : (running || hasData ? 2 : 3);

  return (
    <div className="bb-page bb-guest">
      <PageTitle
        title="Gastdaten übernehmen"
        subtitle="Verknüpfe deine lokal gespeicherten Gastdaten mit deinem Konto und nimm alles mit – ohne Datenverlust."
        script="Deine Angelmomente bleiben."
      />

      <Stepper current={step} />

      {isLoadingAuth ? (
        <div className="grid place-items-center py-10"><Loader2 className="w-7 h-7 animate-spin text-cyan-300" aria-label="Lädt" /></div>
      ) : (
        <>
          <section className="bb-card bb-guest-card">
            <div className="bb-guest-card-head">
              <span className="bb-guest-db" aria-hidden="true"><Database size={26} /></span>
              <h2>{hasData ? 'Dieses Gerät enthält folgende Gastdaten:' : 'Auf diesem Gerät liegen keine Gastdaten.'}</h2>
              <span className="bb-guest-chip">{isAuthenticated ? <User size={16} aria-hidden="true" /> : <UserPlus size={16} aria-hidden="true" />}{isAuthenticated ? 'Angemeldet' : 'Gast-Modus'}</span>
            </div>

            {hasData && (
              <div className="bb-guest-tiles">
                {TILES.map(tile => {
                  const count = summary[tile.entity] || 0;
                  return (
                    <div key={tile.entity} className={`bb-guest-tile is-${tile.tone}${count ? '' : ' is-empty'}`}>
                      <tile.icon size={30} aria-hidden="true" />
                      <strong>{count} {count === 1 ? tile.one : tile.many}</strong>
                      <small>{tile.text}</small>
                    </div>
                  );
                })}
              </div>
            )}

            {reviewing && hasData && <ReviewList onChange={refresh} />}

            {step === 3 && result && (
              <div className="bb-card bb-card-success bb-guest-note">
                <CheckCircle2 size={34} aria-hidden="true" className="text-[var(--bb-green)] shrink-0" />
                <span>
                  <strong>Übernahme abgeschlossen</strong>
                  <small>
                    {[result.byEntity?.Catch ? `${result.byEntity.Catch} ${result.byEntity.Catch === 1 ? 'Fang' : 'Fänge'}` : null,
                      result.byEntity?.Spot ? `${result.byEntity.Spot} ${result.byEntity.Spot === 1 ? 'Spot' : 'Spots'}` : null]
                      .filter(Boolean).join(' und ') || 'Alle Einträge'} liegen jetzt in deinem Konto
                    {result.at ? ` (${formatDate(result.at)})` : ''}.
                  </small>
                </span>
              </div>
            )}

            {(step < 3 || !result) && (
              <div className="bb-card bb-card-success bb-guest-note">
                <CheckCircle2 size={34} aria-hidden="true" className="text-[var(--bb-green)] shrink-0" />
                <span>
                  <strong>Keine doppelte Datenerfassung</strong>
                  <small>Deine lokalen Gastdaten werden bei der Anmeldung automatisch in dein Konto übernommen. Du musst nichts erneut eingeben.</small>
                </span>
                <ShieldCheck size={34} aria-hidden="true" className="bb-guest-note-shield" />
              </div>
            )}
          </section>

          {!isAuthenticated && (
            <div className="bb-guest-actions">
              <Link to="/Home?auth=register" className="bb-action bb-action-block">
                <UserPlus size={22} aria-hidden="true" className="bb-action-icon" /><span>Mit Konto verknüpfen</span><ArrowRight size={20} aria-hidden="true" className="bb-action-arrow" />
              </Link>
              {hasData && (
                <button type="button" className="bb-secondary bb-guest-secondary" onClick={() => setReviewing(value => !value)} aria-expanded={reviewing}>
                  <FileSearch size={20} aria-hidden="true" /><span>{reviewing ? 'Prüfung schließen' : 'Vorher prüfen'}</span><ArrowRight size={18} aria-hidden="true" />
                </button>
              )}
              <p className="bb-guest-foot">Schon ein Konto? <Link to="/Home" className="text-[var(--bb-cyan)]">Anmelden</Link> – die Übernahme läuft genauso.</p>
            </div>
          )}

          {isAuthenticated && step === 2 && (
            <div className="bb-guest-actions">
              <button type="button" className="bb-action bb-action-block" onClick={transferNow} disabled={running}>
                {running ? <Loader2 size={22} aria-hidden="true" className="animate-spin bb-action-icon" /> : <RefreshCw size={22} aria-hidden="true" className="bb-action-icon" />}
                <span>{running ? 'Wird übernommen …' : 'Jetzt übernehmen'}</span>
                <ArrowRight size={20} aria-hidden="true" className="bb-action-arrow" />
              </button>
              {result?.failed > 0 && !running && (
                <p className="bb-guest-foot text-amber-300">Beim letzten Versuch sind {result.failed} Einträge nicht angekommen. Sie bleiben auf dem Gerät, bis die Übernahme klappt.</p>
              )}
              <button type="button" className="bb-secondary bb-guest-secondary" onClick={() => setReviewing(value => !value)} aria-expanded={reviewing}>
                <FileSearch size={20} aria-hidden="true" /><span>{reviewing ? 'Prüfung schließen' : 'Vorher prüfen'}</span><ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          )}

          {isAuthenticated && step === 3 && (
            <div className="bb-guest-actions">
              <Link to="/Logbook" className="bb-action bb-action-block">
                <BookOpen size={22} aria-hidden="true" className="bb-action-icon" /><span>Zum Fangbuch</span><ArrowRight size={20} aria-hidden="true" className="bb-action-arrow" />
              </Link>
              <Link to="/Dashboard" className="bb-secondary bb-guest-secondary"><span>Zum Dashboard</span><ArrowRight size={18} aria-hidden="true" /></Link>
            </div>
          )}

          <p className="bb-guest-lock"><Lock size={15} aria-hidden="true" />Sicher. Lokal. In deinem Konto. Für deine Angelmomente.</p>
        </>
      )}
    </div>
  );
}
