import React from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Palette, Zap, Volume2, Shield, FileText, BellRing, Fish, Compass } from 'lucide-react';
import GeneralSettings from './GeneralSettings';
import AppearanceSettings from './AppearanceSettings';
import BatterySettings from './BatterySettings';
import VoiceSettings from './VoiceSettings';
import TickerSettings from './TickerSettings';
import ActionNotificationSettings from './ActionNotificationSettings';
import DeleteAccountSection from './DeleteAccountSection';
import { useTheme } from '@/lib/ThemeContext';
import { useSearchParams } from 'react-router-dom';
import BuddySettings from './BuddySettings';
import LocalAiSettings from './LocalAiSettings';
import NavigationSettings from './NavigationSettings';
import FishingPreferencesSettings from './FishingPreferencesSettings';
import OnboardingSettings from './OnboardingSettings';
import PageTitle from '@/components/layout/PageTitle';

// KI-Buddy-Reiter: Persönlichkeit/Stimme plus KI-Modus (Cloud oder Gerät).
// Das Zahnrad des Voice Buddys führt hierher (?tab=buddy).
function BuddyTab() {
  return (
    <div className="space-y-6">
      <BuddySettings />
      <LocalAiSettings />
    </div>
  );
}

export default function SettingsPageTabbed({ headerAction = null } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'general';
  const setActiveTab = tab => setSearchParams({ tab }, { replace: true });
  const { animationsEnabled } = useTheme();

  const tabs = [
    { id: 'buddy', label: 'KI-Buddy', icon: Volume2, component: BuddyTab },
    { id: 'onboarding', label: 'Einführung', icon: Compass, component: OnboardingSettings },
    { id: 'fishing', label: 'Angeln', icon: Fish, component: FishingPreferencesSettings },
    { id: 'navigation', label: 'Navigation', icon: Settings, component: NavigationSettings },
    {
      id: 'general',
      label: 'Allgemein',
      icon: Settings,
      component: GeneralSettings
    },
    {
      id: 'appearance',
      label: 'Darstellung',
      icon: Palette,
      component: AppearanceSettings
    },
    {
      id: 'battery',
      label: 'Akku',
      icon: Zap,
      component: BatterySettings
    },
    {
      id: 'voice',
      label: 'Audio',
      icon: Volume2,
      component: VoiceSettings
    },
    {
      id: 'ticker',
      label: 'Ticker',
      icon: Shield,
      component: TickerSettings
    },
    {
      id: 'notifications',
      label: 'Benachrichtigungen',
      icon: BellRing,
      component: ActionNotificationSettings
    }
  ];

  const ActiveComponent = tabs.find(t => t.id === activeTab)?.component || GeneralSettings;

  const tabVariants = {
    enter: { opacity: 0, y: 10 },
    center: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 }
  };

  return (
    <div className="min-h-screen w-full px-4 sm:px-6 lg:px-8 pb-32">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <PageTitle className="mb-6" title="Deine Einstellungen" subtitle="Personalisiere BaitBuddy nach deinen Vorlieben." rightAction={headerAction} />

        {/* Tab Navigation */}
        <div className="mb-8">
          <div>
            <div className="bb-tab-bar" role="tablist" aria-label="Einstellungsbereiche">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <button type="button"
                    key={tab.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.id)}
                    className={`bb-tab-pill inline-flex items-center gap-2 min-h-[44px] ${isActive ? 'bb-tab-active' : ''}`}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            variants={animationsEnabled ? tabVariants : { enter: { opacity: 1, y: 0 }, center: { opacity: 1, y: 0 }, exit: { opacity: 1, y: 0 } }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={animationsEnabled ? { duration: 0.2 } : { duration: 0 }}
          >
            <ActiveComponent />
          </motion.div>
        </AnimatePresence>

        {/* Additional Sections */}
        <div className="mt-8 space-y-6">
          {/* Delete Account */}
          <DeleteAccountSection />

          {/* Legal */}
          <div className="glass-morphism border-gray-800 rounded-2xl p-6">
            <h2 className="text-cyan-400 text-lg font-semibold drop-shadow-[0_0_12px_rgba(34,211,238,0.7)] mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Rechtliches
            </h2>
            <div className="space-y-2">
              <Link
                to="/Datenschutz"
                className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/40 hover:bg-gray-700/50 transition-colors text-gray-200 hover:text-cyan-400 group"
              >
                <Shield className="w-4 h-4 text-cyan-500 shrink-0 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium">Datenschutzerklärung</span>
              </Link>
              <Link
                to="/AGB"
                className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/40 hover:bg-gray-700/50 transition-colors text-gray-200 hover:text-cyan-400 group"
              >
                <FileText className="w-4 h-4 text-cyan-500 shrink-0 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium">Nutzungsbedingungen (AGB)</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
