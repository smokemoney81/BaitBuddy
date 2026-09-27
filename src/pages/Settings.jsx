import React from 'react';
import SettingsPageTabbed from '@/components/settings/SettingsPageTabbed';
import { useFeatureTracking } from '@/hooks/useFeatureTracking';

export default function Settings() {
  useFeatureTracking('einstellungen');

  return (
    <div className="min-h-screen w-full bb-app">
      <SettingsPageTabbed />
    </div>
  );
}
