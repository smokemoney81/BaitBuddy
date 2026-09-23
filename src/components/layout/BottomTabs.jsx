import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus, Fish, MapPin, Calendar, Brain, Lock, Camera, Mic } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useNavigationContext } from '@/lib/NavigationContext';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import { navigationItems } from '@/components/navigation/navigationItems';
import { useTool } from '@/hooks/useTool';
import { trackFeatureClick } from '@/components/utils/tracker';

const ARIA_LABELS = {
  Dashboard: 'Dashboard',
  Logbook: 'Logbook',
  Weather: 'Weather',
  Community: 'Community',
  Map: 'Map',
  KiBuddyBeta: 'AI Buddy',
  TripPlanner: 'Trip Planner',
  Gear: 'Gear',
  Profile: 'Profile',
  PremiumPlans: 'Premium',
  Settings: 'Settings',
};

export default function BottomTabs() {
  const { navigation } = useBuddyPreferences();
  const { switchTab, getTabStack } = useNavigationContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { getToolByRoute, isToolAccessible } = useTool();
  const activePage = location.pathname.split('/')[1] || 'Dashboard';

  const follow = (event, path) => {
    event.preventDefault();
    trackFeatureClick(path, { source: 'bottom_tabs' });
    switchTab(path);
    const stack = getTabStack(path);
    navigate(stack.length ? stack[stack.length - 1] : `/${path}`);
  };

  const renderLink = path => {
    const tool = getToolByRoute(`/${path}`);
    const accessible = tool ? isToolAccessible(tool.id) : true;
    const { name, icon: Icon } = tool || navigationItems[path];
    const ariaLabel = ARIA_LABELS[path] || name;
    const isActive = activePage === path;

    if (!accessible) {
      return (
        <div
          key={path}
          role="tab"
          aria-label={ariaLabel}
          aria-disabled="true"
          className="bb-nav-item bb-nav-locked"
          title={`Freischalten über ${tool.requires || 'Premium'}`}
        >
          <Lock size={20} aria-hidden="true" />
          <span>{name}</span>
        </div>
      );
    }

    return (
      <Link
        key={path}
        to={`/${path}`}
        onClick={e => follow(e, path)}
        role="tab"
        aria-label={ariaLabel}
        aria-selected={isActive}
        className={`bb-nav-item ${isActive ? 'bb-nav-active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon size={20} aria-hidden="true" />
        <span>{name}</span>
      </Link>
    );
  };

  const split = Math.ceil(navigation.length / 2);

  return (
    <>
      <nav className="bb-navbar" role="tablist" aria-label="Hauptnavigation">
        <div className="bb-navbar-inner">
          {navigation.slice(0, split).map(renderLink)}

          <div className="bb-fab-container">
            <button
              type="button"
              className="bb-fab"
              aria-label="Schnellaktionen öffnen"
              onClick={() => setOpen(true)}
            >
              <Plus size={28} strokeWidth={2.5} />
            </button>
          </div>

          {navigation.slice(split).map(renderLink)}
        </div>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="bb-app rounded-t-3xl border-0 pb-[calc(24px+env(safe-area-inset-bottom))] [&>button]:h-11 [&>button]:w-11"
        >
          <SheetHeader>
            <SheetTitle className="text-white text-lg">
              Was möchtest du machen?
            </SheetTitle>
            <SheetDescription className="bb-muted">
              Dein nächster Schritt am Wasser.
            </SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3 mt-6 max-w-xl mx-auto">
            <button
              type="button"
              className="bb-quick-action-card"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new CustomEvent('openCatchDialog'));
              }}
            >
              <div className="bb-quick-action-icon" style={{ background: 'rgba(0,229,255,.12)' }}>
                <Camera size={22} className="text-bb-cyan" />
              </div>
              <span className="font-semibold text-sm">Fang erfassen</span>
              <span className="text-xs text-slate-400">Foto, Daten, Köder</span>
            </button>

            {[
              [Calendar, 'Ausflug planen', 'TripPlanner', '/TripPlanner?new=1', 'rgba(0,255,157,.12)', 'text-bb-green'],
              [Brain, 'KI-Buddy', 'KiBuddyBeta', '/KiBuddyBeta', 'rgba(0,229,255,.12)', 'text-bb-cyan'],
              [MapPin, 'Spot speichern', 'Map', '/Map?addSpot=1', 'rgba(255,159,10,.12)', 'text-bb-orange'],
              [Mic, 'Voice Buddy', 'KiBuddyBeta', '/KiBuddyBeta?voice=1', 'rgba(0,229,255,.12)', 'text-bb-cyan'],
              [Fish, 'Fangbuch', 'Logbook', '/Logbook', 'rgba(0,255,157,.12)', 'text-bb-green'],
            ].map(([Icon, label, page, to, bgColor, textColor]) => {
              const tool = getToolByRoute(`/${page}`);
              const accessible = tool ? isToolAccessible(tool.id) : true;
              return accessible ? (
                <Link
                  key={to}
                  className="bb-quick-action-card"
                  to={to}
                  onClick={() => setOpen(false)}
                >
                  <div className="bb-quick-action-icon" style={{ background: bgColor }}>
                    <Icon size={22} className={textColor} />
                  </div>
                  <span className="font-semibold text-sm">{label}</span>
                </Link>
              ) : (
                <div
                  key={to}
                  className="bb-quick-action-card opacity-40 cursor-not-allowed"
                  title={`Freischalten über ${tool?.requires || 'Premium'}`}
                >
                  <div className="bb-quick-action-icon" style={{ background: 'rgba(255,255,255,.05)' }}>
                    <Lock size={22} className="text-slate-500" />
                  </div>
                  <span className="font-semibold text-sm">{label}</span>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
