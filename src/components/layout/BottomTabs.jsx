import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus, Fish, MapPin, Calendar, Brain, Lock } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useNavigationContext } from '@/lib/NavigationContext';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import { navigationItems } from '@/components/navigation/navigationItems';
import { useTool } from '@/hooks/useTool';
import { trackFeatureClick } from '@/components/utils/tracker';
// Map route names to English aria-labels for accessibility
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
    event.preventDefault(); trackFeatureClick(path, { source: 'bottom_tabs' }); switchTab(path);
    const stack = getTabStack(path); navigate(stack.length ? stack[stack.length - 1] : `/${path}`);
  };

  const renderLink = path => {
    // Nachschlagen ueber die ROUTE, nicht ueber den Seitennamen: die Tool-IDs
    // sind kebab-case ('catches', 'ki-buddy'), die Navigationsschluessel aber
    // Routennamen ('Logbook', 'KiBuddyBeta'). `getTool('Logbook')` traf deshalb
    // nie ein Tool, und die Zugriffspruefung lief ins Leere.
    const tool = getToolByRoute(`/${path}`);
    const accessible = tool ? isToolAccessible(tool.id) : true;
    const { name, icon: Icon } = tool || navigationItems[path];
    const ariaLabel = ARIA_LABELS[path] || name;

    if (!accessible) {
      // Auch die gesperrte Variante braucht einen zugaenglichen Namen — ohne
      // aria-label meldet ein Screenreader nur "Tab", und die Tab-Leiste war
      // ueber ihre Rolle nicht mehr auffindbar.
      return <div key={path} role="tab" aria-label={ariaLabel} aria-disabled="true" className="bb-bottom-link opacity-50 cursor-not-allowed" title={`Freischalten über ${tool.requires || 'Premium'}`}><Lock size={22} aria-hidden="true"/><span>{name}</span></div>;
    }

    return <Link key={path} to={`/${path}`} onClick={e => follow(e, path)} role="tab" aria-label={ariaLabel} aria-selected={activePage === path} className="bb-bottom-link" aria-current={activePage === path ? 'page' : undefined}><Icon size={22} aria-hidden="true"/><span>{name}</span></Link>;
  };
  const split = Math.ceil(navigation.length / 2);
  return <>
    <nav className="bb-bottom" role="tablist" aria-label="Hauptnavigation"><div className="bb-bottom-items">
      {navigation.slice(0, split).map(renderLink)}
      <button type="button" className="bb-bottom-plus" aria-label="Schnellaktionen öffnen" onClick={() => setOpen(true)}><Plus size={28}/></button>
      {navigation.slice(split).map(renderLink)}
    </div></nav>
    <Sheet open={open} onOpenChange={setOpen}><SheetContent side="bottom" className="bb-app rounded-t-3xl border-0 pb-[calc(24px+env(safe-area-inset-bottom))] [&>button]:h-11 [&>button]:w-11">
      <SheetHeader><SheetTitle className="text-white">Was möchtest du machen?</SheetTitle><SheetDescription className="bb-muted">Dein nächster Schritt am Wasser.</SheetDescription></SheetHeader>
      <div className="grid gap-3 mt-6 max-w-xl mx-auto">
        <button type="button" className="bb-secondary" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('openCatchDialog')); }}><Fish size={20}/>Fang hinzufügen</button>
        {[[Calendar, 'Ausflug planen', 'TripPlanner', '/TripPlanner?new=1'], [Brain, 'KI-Buddy', 'KiBuddyBeta', '/KiBuddyBeta'], [MapPin, 'Spot speichern', 'Map', '/Map?addSpot=1']].map(([Icon, label, page, to]) => {
          // Wie oben ueber die Route nachschlagen: `getTool('TripPlanner')`
          // traf nie ein Tool, die Pruefung lief also auch hier ins Leere.
          const tool = getToolByRoute(`/${page}`);
          const accessible = tool ? isToolAccessible(tool.id) : true;
          return accessible ? (
            <Link key={to} className="bb-secondary" to={to} onClick={() => setOpen(false)}><Icon size={20}/>{label}</Link>
          ) : (
            <div key={to} className="bb-secondary opacity-50 cursor-not-allowed" title={`Freischalten über ${tool?.requires || 'Premium'}`}><Lock size={20}/>{label}</div>
          );
        })}
      </div>
    </SheetContent></Sheet>
  </>;
}
