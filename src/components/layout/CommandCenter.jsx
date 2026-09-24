import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  X, ChevronRight, ChevronDown, Crown, Bot, Target, Clock, CalendarDays, Backpack,
  LayoutGrid, History, Download, CheckCircle2, LogOut, LogIn, Zap, Wrench, Map as MapIcon,
  Users, Trophy, CloudSun, Fish, GraduationCap, Settings, LifeBuoy,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { entities, events } from '@/api/frontendClient';
import { auth } from '@/api/auth';
import { usePlan } from '@/components/premium/PlanContext';
import { useLocation as useGeoLocation } from '@/components/location/LocationManager';
import { useFishingConditions } from '@/hooks/useFishingConditions';
import { formatForecastTime } from '@/lib/fishingConditions';
import { PAGE_META, readRecentPages } from '@/lib/pageMeta';
import { AvatarCircle } from '@/components/layout/AppTopBar';

// Hauptbereiche der Vorlage. Bereiche mit mehreren Zielen klappen auf,
// damit jede bisherige Funktion aus dem alten Menü erreichbar bleibt.
const AREAS = [
  { name: 'KI-Buddy', icon: Bot, items: [['KI-Buddy Chat', 'KiBuddyBeta'], ['Hands-free Buddy', 'HandsFreeBuddy'], ['Voice-Buddy', 'VoiceChat'], ['BaitBuddy kennt dich', 'BuddyKnowsYou']] },
  { name: 'KI-Tools', icon: Wrench, items: [['Fischbestimmung & Biss', 'AI'], ['Fang-Analyse', 'Analysis'], ['Gewässeranalyse', 'WaterAnalysis'], ['Satellitenanalyse', 'SatelliteAnalysis'], ['Köderempfehlung', 'BaitMixer'], ['3D-Köderführung', 'Koeder3D'], ['AR-Gewässer', 'ARView'], ['AR Knoten AI', 'ARKnotenAssistent'], ['Ausrüstung erkennen', 'GearRecognition'], ['Fischrezepte', 'FishRecipes']] },
  { name: 'Karte & Gewässer', icon: MapIcon, items: [['Karte, Gewässer & Favoriten', 'Map'], ['Tiefenkarten', 'BathymetricCrowdsourcing'], ['Offline-Paket', 'OfflineFishingPack']] },
  { name: 'Community', icon: Users, items: [['Feed, Gruppen & Freunde', 'Community'], ['Ranglisten', 'Rank'], ['Level & Rewards', 'LevelRewards']] },
  { name: 'Trips & Planung', icon: CalendarDays, items: [['Ausflüge & Touren', 'TripPlanner'], ['Neuer Ausflug', 'TripPlanner?new=1'], ['Anglermodus', 'AnglerMode'], ['Live-Trip', 'LiveTrip']] },
  { name: 'Events', icon: Trophy, items: [['Events & Wettbewerbe', 'Events']] },
  { name: 'Wetter & Prognosen', icon: CloudSun, items: [['Wetter, Bissprognose & Solunar', 'Weather']] },
  { name: 'Fangbuch', icon: Fish, items: [['Meine Fänge', 'Logbook'], ['Statistiken & Rekorde', 'CatchStats']] },
  { name: 'Ausrüstung', icon: Backpack, items: [['Equipment, Sets & Köder', 'Gear'], ['Wartung', 'GearMaintenance'], ['Meine Geräte', 'MyDevices'], ['Shop', 'Shop'], ['Gebrauchte Ausrüstung', 'UsedGear']] },
  { name: 'Lernen', icon: GraduationCap, items: [['Prüfung & Schonzeiten', 'AngelscheinPruefungSchonzeiten'], ['Regel-Assistent', 'RuleAssistant'], ['Quiz', 'Quiz'], ['Anleitungen', 'Tutorials'], ['Lizenzen', 'Licenses']] },
  { name: 'Einstellungen', icon: Settings, items: [['Profil', 'Profile'], ['KI-Buddy', 'Settings?tab=buddy'], ['Navigation', 'Settings?tab=navigation'], ['Benachrichtigungen', 'Settings?tab=notifications'], ['Audio & Stimme', 'Settings?tab=voice'], ['Privatsphäre & Berechtigungen', 'Privatsphaere'], ['Gastdaten übernehmen', 'GastdatenUebernehmen'], ['Akku & Konto', 'Settings'], ['Tarif & KI-Zugriff', 'PremiumPlans']] },
  { name: 'Hilfe & Rechtliches', icon: LifeBuoy, items: [['Hilfe, FAQ & Support', 'Help'], ['Datenschutz', 'Datenschutz'], ['Impressum', 'Impressum'], ['AGB', 'AGB']] },
];

const OFFLINE_META_KEY = 'bb_offline_pack_meta';
const DAY_MS = 24 * 60 * 60 * 1000;

function readOfflineStatus() {
  try {
    const meta = JSON.parse(localStorage.getItem(OFFLINE_META_KEY) || '{}');
    const stamps = Object.values(meta).map(entry => entry?.ts).filter(Number.isFinite);
    if (!stamps.length) return 'missing';
    return stamps.every(ts => Date.now() - ts <= DAY_MS) ? 'ready' : 'stale';
  } catch {
    return 'missing';
  }
}

function RelevantCard({ to, icon: Icon, title, detail, accent, onNavigate }) {
  return (
    <Link to={to} onClick={onNavigate} className="bb-cc-relevant">
      <Icon size={30} aria-hidden="true" className="bb-cc-relevant-icon" />
      <span className="bb-cc-relevant-title">{title}</span>
      <span className={`bb-cc-relevant-detail${accent ? ' bb-cc-accent' : ''}`}>{detail}</span>
      <ChevronRight size={16} aria-hidden="true" className="bb-cc-relevant-chevron" />
    </Link>
  );
}

export default function CommandCenter({ isOpen, setIsOpen, currentPageName, user }) {
  const { plan } = usePlan();
  const { currentLocation } = useGeoLocation();
  const conditions = useFishingConditions(currentLocation?.lat, currentLocation?.lon);
  const [openArea, setOpenArea] = useState(null);
  const close = () => setIsOpen(false);

  const activeTrips = useQuery({
    queryKey: ['cc-active-trips', user?.id],
    enabled: isOpen && !!user,
    queryFn: () => entities.FishingPlan.filter({ is_active: true }),
    staleTime: 60000,
  });
  const gear = useQuery({
    queryKey: ['cc-gear-count', user?.id],
    enabled: isOpen && !!user,
    queryFn: () => entities.GearItem.list(),
    staleTime: 60000,
  });
  const points = useQuery({
    queryKey: ['cc-points', user?.id],
    enabled: isOpen && !!user,
    queryFn: () => events.getCurrentPoints(),
    staleTime: 60000,
  });

  const activeTrip = Array.isArray(activeTrips.data) ? activeTrips.data[0] : null;
  const gearCount = Array.isArray(gear.data) ? gear.data.length : null;
  const totalPoints = Math.round(points.data?.total_points || 0);
  const bestWindow = conditions.window;
  const recent = isOpen ? readRecentPages().slice(0, 3) : [];
  const offline = isOpen ? readOfflineStatus() : 'missing';
  const displayName = user?.nickname || user?.full_name || 'Gast';
  const isPaid = plan && plan.id && plan.id !== 'free';

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent
        side="left"
        className="bb-app bb-cc w-[94vw] max-w-[440px] border-0 overflow-y-auto p-0 [&>button]:hidden"
      >
        <div className="bb-cc-inner">
          <div className="bb-cc-head">
            <div>
              <SheetTitle className="bb-cc-title">Command <span className="bb-title-accent">Center</span></SheetTitle>
              <SheetDescription className="bb-cc-sub">Dein Angelassistent – alles an einem Ort.</SheetDescription>
            </div>
            <button type="button" className="bb-round-btn" onClick={close} aria-label="Command Center schließen">
              <X size={24} aria-hidden="true" />
            </button>
          </div>

          {/* Profil + Tarif */}
          <section className="bb-card bb-cc-profile">
            <Link to={user ? '/Profile' : '/GastdatenUebernehmen'} onClick={close} className="bb-cc-profile-row">
              <AvatarCircle user={user} />
              <span className="flex-1 min-w-0">
                <strong className="bb-cc-name">{displayName}</strong>
                {user ? (
                  <span className="bb-cc-meta"><Zap size={14} aria-hidden="true" /> {totalPoints} Event-Punkte</span>
                ) : (
                  <span className="bb-cc-meta">Gastmodus – Daten bleiben auf diesem Gerät</span>
                )}
              </span>
              <ChevronRight size={22} aria-hidden="true" className="text-slate-300" />
            </Link>
            <div className="bb-cc-plan">
              <span className="bb-cc-plan-icon"><Crown size={22} aria-hidden="true" /></span>
              <span className="flex-1 min-w-0">
                <strong className="bb-title-accent">{plan?.name || (user ? 'Kostenlos' : 'Gast')}</strong>
                <span className="bb-cc-meta">{isPaid ? 'Dein aktiver Tarif' : 'Mehr KI-Funktionen freischalten'}</span>
              </span>
              {user ? (
                <Link to="/PremiumPlans" onClick={close} className="bb-cc-plan-btn">{isPaid ? 'Tarif' : 'Upgrade'}</Link>
              ) : (
                <button type="button" className="bb-cc-plan-btn" onClick={() => auth.redirectToLogin()}>
                  <LogIn size={16} aria-hidden="true" /> Anmelden
                </button>
              )}
            </div>
          </section>

          {/* Hey Buddy */}
          <Link to="/KiBuddyBeta" onClick={close} className="bb-cc-buddy">
            <Bot size={40} aria-hidden="true" className="bb-cc-buddy-icon" />
            <span className="flex-1 min-w-0">
              <strong className="bb-cc-buddy-title">Hey <span className="bb-title-accent">Buddy</span></strong>
              <span className="bb-cc-meta">Frag mich alles rund ums Angeln!</span>
            </span>
            <ChevronRight size={26} aria-hidden="true" className="bb-title-accent" />
          </Link>

          {/* Jetzt relevant */}
          <section aria-labelledby="cc-relevant">
            <div className="bb-section-head">
              <h2 id="cc-relevant" className="bb-section-title"><Target size={22} aria-hidden="true" />Jetzt relevant</h2>
            </div>
            <div className="bb-cc-relevant-grid">
              {activeTrip ? (
                <RelevantCard to="/AnglerMode" icon={Clock} title="Trip fortsetzen" detail={activeTrip.name || activeTrip.title || 'Aktiver Trip'} onNavigate={close} />
              ) : (
                <RelevantCard to="/TripPlanner?new=1" icon={CalendarDays} title="Ausflug planen" detail="Wo, wann, womit?" onNavigate={close} />
              )}
              {bestWindow ? (
                <RelevantCard
                  to="/Weather"
                  icon={Clock}
                  title="Bestes Fenster"
                  detail={`${formatForecastTime(bestWindow.start, conditions.data?.timezone)} – ${formatForecastTime(bestWindow.end, conditions.data?.timezone)}`}
                  accent
                  onNavigate={close}
                />
              ) : (
                <RelevantCard to="/Weather" icon={CloudSun} title="Wetter" detail={conditions.hasLocation ? 'Prognose laden' : 'Standort wählen'} onNavigate={close} />
              )}
              <RelevantCard
                to="/Gear"
                icon={Backpack}
                title="Ausrüstung prüfen"
                detail={gearCount == null ? 'Alles bereit?' : `${gearCount} ${gearCount === 1 ? 'Teil' : 'Teile'} erfasst`}
                onNavigate={close}
              />
            </div>
          </section>

          {/* Hauptbereiche */}
          <section aria-labelledby="cc-areas">
            <div className="bb-section-head">
              <h2 id="cc-areas" className="bb-section-title"><LayoutGrid size={22} aria-hidden="true" />Hauptbereiche</h2>
            </div>
            <div className="bb-cc-areas">
              {AREAS.map(area => {
                const Icon = area.icon;
                const single = area.items.length === 1;
                const expanded = openArea === area.name;
                const containsCurrent = area.items.some(([, path]) => path.split('?')[0] === currentPageName);
                const inner = (
                  <>
                    <Icon size={22} aria-hidden="true" className="bb-title-accent shrink-0" />
                    <span className="flex-1 min-w-0">{area.name}</span>
                    {single || !expanded
                      ? <ChevronRight size={18} aria-hidden="true" />
                      : <ChevronDown size={18} aria-hidden="true" />}
                  </>
                );
                return (
                  <React.Fragment key={area.name}>
                    {single ? (
                      <Link
                        to={`/${area.items[0][1]}`}
                        onClick={close}
                        className="bb-cc-area"
                        aria-current={containsCurrent ? 'page' : undefined}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="bb-cc-area"
                        aria-expanded={expanded}
                        data-current={containsCurrent || undefined}
                        onClick={() => setOpenArea(expanded ? null : area.name)}
                      >
                        {inner}
                      </button>
                    )}
                    {expanded && (
                      <div className="bb-cc-area-items">
                        {area.items.map(([label, path]) => (
                          <Link
                            key={path}
                            to={`/${path}`}
                            onClick={close}
                            aria-current={currentPageName === path.split('?')[0] ? 'page' : undefined}
                          >
                            {label}
                            <ChevronRight size={16} aria-hidden="true" />
                          </Link>
                        ))}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </section>

          {/* Zuletzt verwendet */}
          {recent.length > 0 && (
            <section aria-labelledby="cc-recent">
              <div className="bb-section-head">
                <h2 id="cc-recent" className="bb-section-title"><History size={22} aria-hidden="true" />Zuletzt verwendet</h2>
              </div>
              <div className="bb-cc-relevant-grid">
                {recent.map(page => {
                  const { title, icon: Icon } = PAGE_META[page];
                  return (
                    <Link key={page} to={`/${page}`} onClick={close} className="bb-cc-recent">
                      <Icon size={28} aria-hidden="true" className="bb-title-accent" />
                      <span className="bb-cc-relevant-title">{title}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Offline-Status */}
          <section className={`bb-card bb-cc-offline${offline === 'ready' ? ' bb-card-success' : ''}`}>
            <span className={`bb-cc-offline-icon${offline === 'ready' ? ' is-ready' : ''}`}>
              {offline === 'ready' ? <CheckCircle2 size={24} aria-hidden="true" /> : <Download size={24} aria-hidden="true" />}
            </span>
            <span className="flex-1 min-w-0">
              <strong className={offline === 'ready' ? 'text-[var(--bb-green)]' : ''}>
                {offline === 'ready' ? 'Offline bereit' : offline === 'stale' ? 'Offline-Daten veraltet' : 'Offline-Paket fehlt'}
              </strong>
              <span className="bb-cc-meta">Spots, Fangbuch & Schonzeiten ohne Netz.</span>
            </span>
            <Link to="/OfflineFishingPack" onClick={close} className="bb-cc-plan-btn">Verwalten</Link>
          </section>

          {user && (
            <button type="button" className="bb-secondary w-full justify-center text-red-300" onClick={() => auth.logout('/Home')}>
              <LogOut size={18} aria-hidden="true" /> Abmelden
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
