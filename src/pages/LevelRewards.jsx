import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Info, Crown, ChevronRight, Award, Star, CalendarClock, Trophy, Gift, Lock, CheckCircle2,
  Loader2, AlertTriangle, Sparkles, Fish,
} from 'lucide-react';
import PageTitle from '@/components/layout/PageTitle';
import { progress as progressApi } from '@/api/frontendClient';
import { useAuth } from '@/lib/AuthContext';
import { usePlan } from '@/components/premium/PlanContext';
import { getPlanLevel } from '@/components/premium/planHierarchy';
import { PLAN_TIERS, capabilityRows } from '@/lib/planAiCapabilities';
import { AvatarCircle } from '@/components/layout/AppTopBar';
import { fishImageFor } from '@/lib/fishImages';
import { useTool } from '@/hooks/useTool';

const REWARD_STATE = {
  won: { label: 'Gewonnen', tone: 'green' },
  participated: { label: 'Teilgenommen', tone: 'grey' },
  running: { label: 'Läuft', tone: 'cyan' },
  upcoming: { label: 'Demnächst', tone: 'grey' },
};

const XP_LABELS = {
  catch: 'Fang eingetragen',
  catchPhoto: 'Fang mit Foto (zusätzlich)',
  spot: 'Spot gespeichert',
  trip: 'Trip geplant',
  eventJoined: 'An einem Event teilgenommen',
  eventWon: 'Event gewonnen',
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString('de-DE');
}

function tierForPlan(planId) {
  const level = Math.min(3, getPlanLevel(planId));
  return PLAN_TIERS[level];
}

function Tile({ icon: Icon, title, value, text, tone }) {
  return (
    <div className={`bb-lvl-tile is-${tone}`}>
      <Icon size={30} aria-hidden="true" />
      <strong>{value}</strong>
      <span className="bb-lvl-tile-title">{title}</span>
      <small>{text}</small>
    </div>
  );
}

export default function LevelRewards() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const { plan } = usePlan();
  const { getTool } = useTool();
  const [showRules, setShowRules] = useState(false);
  const query = useQuery({
    queryKey: ['progress-me', user?.id],
    enabled: isAuthenticated,
    queryFn: () => progressApi.me(),
    staleTime: 60000,
  });

  const title = (
    <PageTitle
      title="Level & Rewards"
      subtitle="Angeln. Erleben. Aufsteigen."
      rightAction={(
        <button type="button" className="bb-round-btn" onClick={() => setShowRules(v => !v)} aria-expanded={showRules} aria-label="So sammelst du XP">
          <Info size={22} aria-hidden="true" />
        </button>
      )}
    />
  );

  if (isLoadingAuth || (isAuthenticated && query.isLoading)) {
    return <div className="bb-page">{title}<div className="grid place-items-center py-12"><Loader2 className="w-7 h-7 animate-spin text-cyan-300" aria-label="Lädt" /></div></div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="bb-page">
        {title}
        <div className="bb-card text-center">
          <Award size={40} aria-hidden="true" className="mx-auto mb-3 text-amber-300" />
          <p className="text-slate-200">Level und Abzeichen werden aus deinen Fängen, Spots, Trips und Events berechnet – dafür brauchst du ein Konto.</p>
          <Link to="/GastdatenUebernehmen" className="bb-action mt-4 inline-flex">Konto verknüpfen</Link>
        </div>
      </div>
    );
  }

  // Nur eine vollständige Antwort anzeigen; alles andere als Fehler behandeln,
  // statt an fehlenden Feldern abzustürzen.
  const valid = query.data && Number.isFinite(query.data.xp) && Array.isArray(query.data.badges);
  if (query.isError || !valid) {
    return (
      <div className="bb-page">
        {title}
        <div className="bb-card bb-card-warn text-center">
          <AlertTriangle size={32} aria-hidden="true" className="mx-auto mb-2 text-amber-300" />
          <p className="text-slate-200">Dein Fortschritt konnte nicht geladen werden.</p>
          <button type="button" className="bb-secondary mt-3 inline-flex" onClick={() => query.refetch()}>Erneut versuchen</button>
        </div>
      </div>
    );
  }

  const data = { ...query.data, event_rewards: Array.isArray(query.data.event_rewards) ? query.data.event_rewards : [] };
  const span = Math.max(1, data.next_level_xp - data.level_start_xp);
  const within = Math.max(0, data.xp - data.level_start_xp);
  const percent = Math.min(100, Math.round((within / span) * 100));
  const unlockedBadges = data.badges.filter(b => b.unlocked).length;
  const wins = data.event_rewards.filter(r => r.state === 'won').length;
  const planId = data.plan?.id || plan?.id || 'free';
  const planName = plan?.name && plan.id === planId ? plan.name : tierForPlan(planId).label;
  const isPaid = getPlanLevel(planId) > 0;
  const tier = tierForPlan(planId);
  const tierIndex = PLAN_TIERS.indexOf(tier);
  const advantages = capabilityRows({ voiceRequiredPlanRank: getPlanLevel(getTool('voice-buddy')?.requires || 'basic') }).map(row => ({ label: row.label.replace(/­/g, ''), text: row.cells[tierIndex].text }));
  const expires = data.plan?.expires_at ? new Date(data.plan.expires_at) : null;

  return (
    <div className="bb-page bb-lvl">
      {title}

      {showRules && (
        <section className="bb-card bb-lvl-rules" aria-label="So sammelst du XP">
          <h2>So sammelst du XP</h2>
          <ul>
            {Object.entries(data.rules?.xp || {}).map(([key, xp]) => (
              <li key={key}><span>{XP_LABELS[key] || key}</span><strong>+{xp} XP</strong></li>
            ))}
          </ul>
          <p>Pro Tag zählen höchstens {data.rules?.max_catches_per_day} Fänge. Level {data.level + 1} beginnt bei {formatNumber(data.next_level_xp)} XP.</p>
        </section>
      )}

      <section className="bb-lvl-hero">
        <span className={`bb-lvl-avatar${isPaid ? ' is-gold' : ''}`}>
          <AvatarCircle user={user} />
          {isPaid && <span className="bb-lvl-avatar-crown" aria-hidden="true"><Crown size={16} /></span>}
        </span>
        <div className="min-w-0 flex-1">
          <p className="bb-lvl-level">Level {data.level}</p>
          <p className="bb-lvl-next">{formatNumber(data.next_level_xp - data.xp)} XP bis Level {data.level + 1}</p>
          <div className="bb-lvl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`Fortschritt zu Level ${data.level + 1}`}>
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="bb-lvl-xp">{formatNumber(data.xp)} / {formatNumber(data.next_level_xp)} XP</p>
        </div>
      </section>
      <div className="bb-lvl-meta">
        <Link to="/PremiumPlans" className="bb-lvl-plan"><Crown size={18} aria-hidden="true" />{planName}<ChevronRight size={16} aria-hidden="true" /></Link>
        {data.member_since_days != null && <span>Seit {formatNumber(data.member_since_days)} {data.member_since_days === 1 ? 'Tag' : 'Tagen'} dabei</span>}
      </div>

      <div className="bb-lvl-tiles">
        <Tile icon={Sparkles} tone="cyan" title="XP" value={formatNumber(data.xp)} text="Erfahrung gesammelt" />
        <Tile icon={Award} tone="gold" title="Abzeichen" value={`${unlockedBadges}/${data.badges.length}`} text="Erfolge freigeschaltet" />
        <Tile icon={Crown} tone="gold" title="Tarif" value={planName} text={isPaid ? 'Premium-Funktionen' : 'Basis-Funktionen'} />
        <Tile icon={CalendarClock} tone="gold" title="Laufzeit" value={expires ? expires.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : isPaid ? 'Aktiv' : '–'} text={expires ? 'Tarif gültig bis' : isPaid ? 'Ohne Ablaufdatum' : 'Kein Tarif aktiv'} />
        <Tile icon={Trophy} tone="cyan" title="Events" value={`${wins}/${data.event_rewards.length}`} text="Siege / Teilnahmen" />
      </div>

      <section className="bb-card bb-lvl-plan-card">
        <h2><Crown size={22} aria-hidden="true" />{isPaid ? `Dein Vorteil als ${planName}` : 'Das bringt dir ein Tarif'}</h2>
        <ul>
          {advantages.map(item => (
            <li key={item.label}><CheckCircle2 size={18} aria-hidden="true" /><span><strong>{item.label}:</strong> {item.text}</span></li>
          ))}
        </ul>
        <Link to="/PremiumPlans" className="bb-secondary bb-lvl-more">{isPaid ? 'Mehr erfahren' : 'Tarife ansehen'}<ChevronRight size={18} aria-hidden="true" /></Link>
      </section>

      <section aria-labelledby="lvl-badges">
        <div className="bb-section-head">
          <h2 id="lvl-badges" className="bb-section-title"><Award size={22} aria-hidden="true" />Abzeichen</h2>
          <span className="bb-lvl-count">{unlockedBadges} von {data.badges.length}</span>
        </div>
        <ul className="bb-lvl-badges">
          {data.badges.map(badge => (
            <li key={badge.id} className={badge.unlocked ? 'is-unlocked' : ''}>
              <span className="bb-lvl-badge-icon" aria-hidden="true">{badge.unlocked ? <Star size={22} /> : <Lock size={20} />}</span>
              <strong>{badge.title}</strong>
              <small>{badge.text}</small>
              {!badge.unlocked && (
                <span className="bb-lvl-mini-bar" aria-label={`${badge.current} von ${badge.target}`}><i style={{ width: `${Math.round((badge.current / badge.target) * 100)}%` }} /></span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="lvl-events">
        <div className="bb-section-head">
          <h2 id="lvl-events" className="bb-section-title"><Gift size={22} aria-hidden="true" />Belohnungen aus Events</h2>
          <Link to="/Events" className="bb-see-all">Alle Events <ChevronRight size={16} aria-hidden="true" /></Link>
        </div>
        <p className="bb-lvl-sub">Nimm an Events teil, sammle XP und sichere dir die Preise der Veranstalter.</p>
        {data.event_rewards.length ? (
          <ul className="bb-lvl-rewards">
            {data.event_rewards.map(reward => {
              const state = REWARD_STATE[reward.state] || REWARD_STATE.participated;
              const image = fishImageFor(reward.target_species);
              return (
                <li key={reward.event_id} className={`is-${state.tone}`}>
                  <Link to={`/events/${reward.event_id}`}>
                    <span className="bb-lvl-reward-img" aria-hidden="true">{image ? <img src={image} alt="" /> : <Fish size={34} />}</span>
                    <span className={`bb-lvl-reward-state is-${state.tone}`}>{reward.state === 'won' && <CheckCircle2 size={14} aria-hidden="true" />}{state.label}</span>
                    <strong>{reward.prize || 'Ohne Sachpreis'}</strong>
                    <small>{reward.name}</small>
                    <small>{formatNumber(reward.points)} Punkte</small>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="bb-card bb-lvl-empty">Noch keine Event-Teilnahme. Jedes Event bringt {data.rules?.xp?.eventJoined} XP, ein Sieg {data.rules?.xp?.eventWon} XP.</p>
        )}
      </section>

      <Link to="/Events" className="bb-action bb-action-block">
        <Gift size={22} aria-hidden="true" className="bb-action-icon" /><span>Events entdecken</span><ChevronRight size={20} aria-hidden="true" className="bb-action-arrow" />
      </Link>
    </div>
  );
}
