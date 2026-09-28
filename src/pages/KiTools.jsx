import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Lock } from 'lucide-react';
import PageTitle from '@/components/layout/PageTitle';
import { KI_TOOLS } from '@/components/navigation/kiTools';
import { useTool } from '@/hooks/useTool';
import { useFeatureTracking } from '@/hooks/useFeatureTracking';
import { trackFeatureClick } from '@/components/utils/tracker';
import '@/styles/home-dashboard.css';

const PLAN_LABELS = { basic: 'Basic', pro: 'Pro', elite: 'Ultimate', ultimate: 'Ultimate', friends: 'Freundschaft' };

// Übersicht aller KI-Werkzeuge (Nav-Eintrag „KI-Tools" der Dashboard-Vorlage).
// Sperren kommen aus der Tool-Registry; die Zielseiten prüfen den Tarif
// zusätzlich selbst (PremiumGuard), die Markierung hier ist nur ein Hinweis.
export default function KiTools() {
  useFeatureTracking('ki_tools');
  const { getToolByRoute, isToolAccessible } = useTool();

  return (
    <div className="bb-page bb-ki-tools">
      <PageTitle title="Deine KI-Tools" subtitle="Alle KI-Werkzeuge von BaitBuddy an einem Ort." />
      <ul className="bb-ki-tools-grid">
        {KI_TOOLS.map(({ path, name, icon: Icon, description }) => {
          const tool = getToolByRoute(`/${path}`);
          const locked = tool ? !isToolAccessible(tool.id) : false;
          const planLabel = locked ? PLAN_LABELS[tool.requires] || 'Premium' : null;
          return (
            <li key={path}>
              <Link
                to={`/${path}`}
                className={`bb-ki-tool${locked ? ' is-locked' : ''}`}
                onClick={() => trackFeatureClick(path, { source: 'ki_tools' })}
                aria-label={locked ? `${name}, ab ${planLabel}` : name}
              >
                <span className="bb-ki-tool-icon"><Icon size={24} strokeWidth={1.7} aria-hidden="true" /></span>
                <span className="bb-ki-tool-text">
                  <strong>{name}</strong>
                  <small>{description}</small>
                </span>
                {locked ? (
                  <span className="bb-ki-tool-lock"><Lock size={14} aria-hidden="true" />{planLabel}</span>
                ) : (
                  <ChevronRight size={20} aria-hidden="true" className="bb-ki-tool-chevron" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
