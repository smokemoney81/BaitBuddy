import React from 'react';
import { Link } from 'react-router-dom';
import { Camera, Map, BookOpen, Calendar, CloudSun, Brain } from 'lucide-react';
import { trackFeatureClick } from '@/components/utils/tracker';

const ACTIONS = [
  { path: '/CatchCam', icon: Camera, label: 'Fang\nerfassen' },
  { path: '/Map', icon: Map, label: 'Spots\nentdecken' },
  { path: '/Logbook', icon: BookOpen, label: 'Fang-\nbuch' },
  { path: '/TripPlanner?new=1', icon: Calendar, label: 'Trip\nplanen' },
  { path: '/Weather', icon: CloudSun, label: 'Wetter\n& Biss' },
  { path: '/KiBuddyBeta', icon: Brain, label: 'KI-\nBuddy' },
];

export default function DashboardQuickActions() {
  return (
    <div className="bb-quick-actions" role="list" aria-label="Schnellzugriffe">
      {ACTIONS.map(({ path, icon: Icon, label }) => (
        <Link
          key={path}
          to={path}
          className="bb-quick-action"
          role="listitem"
          onClick={() => trackFeatureClick(path.split('/')[1] || path, { source: 'dashboard_quick' })}
        >
          <div className="bb-quick-action-icon">
            <Icon size={20} strokeWidth={1.6} />
          </div>
          <span className="bb-quick-action-label">{label}</span>
        </Link>
      ))}
    </div>
  );
}
