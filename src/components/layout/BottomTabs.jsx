import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useNavigationContext } from '@/lib/NavigationContext';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import { navigationItems } from '@/components/navigation/navigationItems';
import { useTool } from '@/hooks/useTool';
import { trackFeatureClick } from '@/components/utils/tracker';
import { useVoiceSpeaking } from '@/hooks/useVoiceActivity';

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
  const { getToolByRoute, isToolAccessible } = useTool();
  const activePage = location.pathname.split('/')[1] || 'Dashboard';
  const voiceSpeaking = useVoiceSpeaking();

  const openBuddyChat = () => {
    const tool = getToolByRoute('/KiBuddyBeta');
    if (tool && !isToolAccessible(tool.id)) return;

    try { navigator.vibrate?.(30); } catch { /* nicht unterstützt */ }
    trackFeatureClick('KiBuddyBeta', { source: 'bottom_tabs_buddy' });
    navigate('/KiBuddyBeta');
  };

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
    const Icon = navigationItems[path]?.icon;
    const name = navigationItems[path]?.name || tool?.name || path;
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
          <Lock size={26} aria-hidden="true" />
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
        title={name}
      >
        {Icon && <Icon size={26} strokeWidth={1.8} aria-hidden="true" />}
      </Link>
    );
  };

  const split = Math.ceil(navigation.length / 2);

  return (
    <nav className="bb-navbar" role="tablist" aria-label="Hauptnavigation">
      <div className="bb-navbar-inner">
        {navigation.slice(0, split).map(renderLink)}

        <div className="bb-fab-container">
          <button
            type="button"
            className={`bb-fab bb-fab-logo${voiceSpeaking ? ' bb-fab-speaking' : ''}`}
            data-speaking={voiceSpeaking ? 'true' : undefined}
            aria-label="KI-Buddy öffnen"
            title="KI-Buddy öffnen"
            onClick={openBuddyChat}
          >
            <img
              src="/assets/buddy/fab-logo.webp"
              alt=""
              aria-hidden="true"
              draggable="false"
              width="64"
              height="64"
            />
          </button>
        </div>

        {navigation.slice(split).map(renderLink)}
      </div>
    </nav>
  );
}
