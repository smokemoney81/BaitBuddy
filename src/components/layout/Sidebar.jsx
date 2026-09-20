import React from 'react';
import { Link } from 'react-router-dom';
import { LogOut, Brain, Map, Cloud, BookOpen, Calendar, Users, Wrench, Zap, Download, Star, Clock } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useHaptic } from '@/components/utils/HapticFeedback';
import { useSound } from '@/components/utils/SoundManager';
import { auth } from '@/api/auth';
import { entities } from '@/api/frontendClient';
import { useQuery } from '@tanstack/react-query';

const MAIN_FEATURES = [
  { icon: Brain, label: 'KI-Buddy', path: 'KiBuddyBeta', description: 'Frag mich alles rund ums Angeln!' },
  { icon: Map, label: 'Karte & Spots', path: 'Map', description: 'Gewässer erkunden' },
  { icon: Cloud, label: 'Wetter', path: 'Weather', description: 'Bissprognose & Bedingungen' },
  { icon: BookOpen, label: 'Fangbuch', path: 'Logbook', description: 'Meine Fänge' },
  { icon: Calendar, label: 'Planung', path: 'TripPlanner', description: 'Ausflüge planen' },
  { icon: Users, label: 'Community', path: 'Community', description: 'Feed & Freunde' },
  { icon: Wrench, label: 'Ausrüstung', path: 'Gear', description: 'Gear & Köder' },
  { icon: Zap, label: 'Premium', path: 'PremiumPlans', description: 'Alle Features freischalten' },
];

function QuickCard({ icon: Icon, title, value, description, onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`flex items-start gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left border border-white/5 hover:border-cyan-400/30 ${className}`}
    >
      <Icon className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-400">{title}</div>
        <div className="font-semibold text-sm text-white truncate">{value}</div>
        {description && <div className="text-xs text-slate-500 mt-0.5">{description}</div>}
      </div>
    </button>
  );
}

export default function Sidebar({ isOpen, setIsOpen, currentPageName, user }) {
  const { triggerHaptic } = useHaptic();
  const { playSound } = useSound();
  const close = () => { triggerHaptic('selection'); playSound('selection'); setIsOpen(false); };

  const { data: dashboardData = {} } = useQuery({
    queryKey: ['dashboard-sidebar', user?.id],
    enabled: !!user?.id && isOpen,
    queryFn: async () => {
      const response = await fetch('/api/dashboard');
      if (!response.ok) return {};
      return response.json();
    },
    staleTime: 60000,
    retry: 1,
  });

  const { data: gear = [] } = useQuery({
    queryKey: ['sidebar-gear', user?.id],
    enabled: !!user?.id && isOpen,
    queryFn: () => entities.GearItem.list().catch(() => []),
    staleTime: 60000,
    retry: 1,
  });

  const { data: trips = [] } = useQuery({
    queryKey: ['sidebar-trips', user?.id],
    enabled: !!user?.id && isOpen,
    queryFn: async () => {
      try {
        const response = await fetch('/api/trips');
        if (!response.ok) return [];
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      } catch {
        return [];
      }
    },
    staleTime: 60000,
    retry: 1,
  });

  const nextTrip = Array.isArray(trips) && trips.length > 0 ? trips[0] : null;
  const gearCount = Array.isArray(gear) ? gear.length : 0;
  const isOfflineReady = typeof localStorage !== 'undefined' ? localStorage.getItem('bb_offline_ready') === 'true' : false;

  const handleNavigation = (path) => {
    close();
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent side="left" className="bb-app w-[88vw] max-w-sm border-0 overflow-y-auto pt-[max(28px,env(safe-area-inset-top))] pb-[max(28px,env(safe-area-inset-bottom))] [&>button]:h-11 [&>button]:w-11 p-0">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-b from-gray-950 via-gray-950 to-transparent px-6 pt-6 pb-4 border-b border-white/5">
            <h2 className="text-2xl font-bold mb-1">Command<span className="text-cyan-400">Center</span></h2>
            <p className="text-xs text-slate-400">Dein Angelassistent – alles an einem Ort</p>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto px-6">
            {/* User Info Card */}
            <Link
              to="/Profile"
              onClick={handleNavigation}
              className="mt-4 mb-6 block p-4 bg-gradient-to-br from-cyan-400/10 to-transparent border border-cyan-400/20 rounded-lg hover:border-cyan-400/40 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                {(user?.profile_picture_url || user?.avatar_url) && (
                  <img
                    src={user.profile_picture_url || user.avatar_url}
                    alt=""
                    className="w-12 h-12 rounded-full object-cover border-2 border-cyan-400/30"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white truncate">{user?.nickname || user?.full_name || 'Angler'}</p>
                  <p className="text-xs text-cyan-300">Level 12 · Angler-Profi</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                <p className="text-xs text-slate-300">2.450 XP bis Level 13</p>
              </div>
            </Link>

            {/* Jetzt relevant */}
            <section className="mb-6">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Jetzt relevant</h3>
              <div className="space-y-2">
                {nextTrip && (
                  <Link to="/TripPlanner" onClick={handleNavigation} className="block">
                    <QuickCard
                      icon={Calendar}
                      title="Trip fortsetzen"
                      value={nextTrip.name || 'Nächster Ausflug'}
                      description={nextTrip.start_date ? new Date(nextTrip.start_date).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' }) : ''}
                    />
                  </Link>
                )}
                {gearCount > 0 && (
                  <Link to="/Gear" onClick={handleNavigation} className="block">
                    <QuickCard
                      icon={Wrench}
                      title="Ausrüstung"
                      value="Alles bereit?"
                      description={`${gearCount} Gegenstände verfügbar`}
                    />
                  </Link>
                )}
                {dashboardData?.top_spots?.[0] && (
                  <Link to="/Map" onClick={handleNavigation} className="block">
                    <QuickCard
                      icon={Map}
                      title="Spot der Woche"
                      value={dashboardData.top_spots[0].name || 'Nächster Spot'}
                      description="Nach Entfernung sortiert"
                    />
                  </Link>
                )}
              </div>
            </section>

            {/* Hauptbereiche */}
            <section className="mb-6">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Hauptbereiche</h3>
              <div className="grid grid-cols-2 gap-2">
                {MAIN_FEATURES.map(({ icon: Icon, label, path, description }) => (
                  <Link
                    key={path}
                    to={`/${path}`}
                    onClick={handleNavigation}
                    className="flex flex-col items-center justify-center p-3 rounded-lg bg-white/5 hover:bg-cyan-400/10 border border-white/5 hover:border-cyan-400/30 transition-colors text-center group"
                  >
                    <Icon className="w-5 h-5 text-cyan-300 mb-2 group-hover:text-cyan-200" />
                    <p className="text-xs font-semibold text-white">{label}</p>
                    <p className="text-xs text-slate-500 mt-1">{description}</p>
                  </Link>
                ))}
              </div>
            </section>

            {/* Zuletzt verwendet */}
            {dashboardData?.recent_catches && dashboardData.recent_catches.length > 0 && (
              <section className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Zuletzt verwendet
                  </h3>
                  <Link to="/Logbook" onClick={handleNavigation} className="text-xs text-cyan-300 hover:text-cyan-200">
                    Alle anzeigen
                  </Link>
                </div>
                <div className="space-y-2">
                  {dashboardData.recent_catches.slice(0, 3).map((catchData) => (
                    <Link key={catchData.id} to="/Logbook" onClick={handleNavigation} className="block">
                      <QuickCard
                        icon={BookOpen}
                        title="Fang"
                        value={catchData.fish_species || 'Unbekannte Art'}
                        description={new Date(catchData.catch_date).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' })}
                      />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Favoriten */}
            {dashboardData?.favorite_spots && dashboardData.favorite_spots.length > 0 && (
              <section className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Star className="w-4 h-4" />
                    Favoriten
                  </h3>
                  <Link to="/Map" onClick={handleNavigation} className="text-xs text-cyan-300 hover:text-cyan-200">
                    Bearbeiten
                  </Link>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {dashboardData.favorite_spots.slice(0, 4).map((spot) => (
                    <Link
                      key={spot.id}
                      to={`/Map?spot=${encodeURIComponent(spot.id)}`}
                      onClick={handleNavigation}
                      className="flex-shrink-0 px-3 py-2 rounded-lg bg-white/5 hover:bg-cyan-400/10 border border-white/5 hover:border-cyan-400/30 transition-colors text-xs whitespace-nowrap text-slate-300 hover:text-cyan-300"
                    >
                      {spot.name}
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Offline bereit */}
            {isOfflineReady && (
              <section className="mb-6 p-3 rounded-lg bg-green-400/10 border border-green-400/20">
                <div className="flex items-center gap-2 mb-2">
                  <Download className="w-4 h-4 text-green-400" />
                  <p className="text-xs font-semibold text-green-300">Offline bereit</p>
                </div>
                <p className="text-xs text-slate-300">Karten, Spots, Wetter & deine Trips verfügbar.</p>
              </section>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-white/5 px-6 py-4 space-y-2">
            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-red-300 transition-colors text-sm font-medium"
              onClick={() => auth.logout('/Home')}
            >
              <LogOut size={16} />
              Abmelden
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
