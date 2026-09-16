import React, { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus, Fish, MapPin, Calendar, Brain, Lock } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useNavigationContext } from '@/lib/NavigationContext';
import { useBuddyPreferences } from '@/lib/BuddyPreferencesContext';
import { navigationItems } from '@/components/navigation/navigationItems';
import { ToolRegistry } from '@/lib/toolRegistry';
import { useTool } from '@/hooks/useTool';
import { trackFeatureClick } from '@/components/utils/tracker';
export default function BottomTabs() {
  const { navigation } = useBuddyPreferences();
  const { switchTab, getTabStack } = useNavigationContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { getTool, isToolAccessible, getUserPlanLevel } = useTool();
  const activePage = location.pathname.split('/')[1] || 'Dashboard';

  const follow = (event, path) => {
    event.preventDefault(); trackFeatureClick(path, { source: 'bottom_tabs' }); switchTab(path);
    const stack = getTabStack(path); navigate(stack.length ? stack[stack.length - 1] : `/${path}`);
  };

  const renderLink = path => {
    const tool = getTool(path);
    const accessible = tool ? isToolAccessible(tool.id) : true;
    const { name, icon: Icon } = tool || navigationItems[path];

    if (!accessible) {
      return <div key={path} className="bb-bottom-link opacity-50 cursor-not-allowed" title={`Freischalten über ${tool.requires || 'Premium'}`}><Lock size={22} aria-hidden="true"/><span>{name}</span></div>;
    }

    return <Link key={path} to={`/${path}`} onClick={e => follow(e, path)} className="bb-bottom-link" aria-current={activePage === path ? 'page' : undefined}><Icon size={22} aria-hidden="true"/><span>{name}</span></Link>;
  };
  const split = Math.ceil(navigation.length / 2);
  return <>
    <nav className="bb-bottom" aria-label="Hauptnavigation"><div className="bb-bottom-items">
      {navigation.slice(0, split).map(renderLink)}
      <button type="button" className="bb-bottom-plus" aria-label="Schnellaktionen öffnen" onClick={() => setOpen(true)}><Plus size={28}/></button>
      {navigation.slice(split).map(renderLink)}
    </div></nav>
    <Sheet open={open} onOpenChange={setOpen}><SheetContent side="bottom" className="bb-app rounded-t-3xl border-0 pb-[calc(24px+env(safe-area-inset-bottom))] [&>button]:h-11 [&>button]:w-11">
      <SheetHeader><SheetTitle className="text-white">Was möchtest du machen?</SheetTitle><SheetDescription className="bb-muted">Dein nächster Schritt am Wasser.</SheetDescription></SheetHeader>
      <div className="grid gap-3 mt-6 max-w-xl mx-auto">
        <button type="button" className="bb-secondary" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent('openCatchDialog')); }}><Fish size={20}/>Fang hinzufügen</button>
        {[[Calendar, 'Ausflug planen', 'TripPlanner', '/TripPlanner?new=1'], [Brain, 'KI-Buddy', 'KiBuddyBeta', '/KiBuddyBeta'], [MapPin, 'Spot speichern', 'Map', '/Map?addSpot=1']].map(([Icon, label, toolId, to]) => {
          const tool = getTool(toolId);
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
