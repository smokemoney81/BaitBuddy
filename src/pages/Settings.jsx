import React, { useState } from 'react';
import SettingsPageTabbed from '@/components/settings/SettingsPageTabbed';
import TutorialButton from '@/components/tutorial/TutorialButton';
import TutorialModal from '@/components/tutorial/TutorialModal';
import { useFeatureTracking } from '@/hooks/useFeatureTracking';

export default function Settings() {
  useFeatureTracking('einstellungen');
  const [tutorialOpen, setTutorialOpen] = useState(false);

  return (
    <div className="min-h-screen w-full bb-app">
      <TutorialButton onClick={() => setTutorialOpen(true)} />
      <SettingsPageTabbed />
      <TutorialModal isOpen={tutorialOpen} onClose={() => setTutorialOpen(false)} />
    </div>
  );
}