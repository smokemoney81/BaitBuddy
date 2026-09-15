import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { auth } from '@/api/auth';
import { BUDDIES, normalizeBuddy, normalizeNavigation, normalizeFishing } from './buddyPreferences';
import { setPreferredTtsVoice, setActiveBuddyAudio } from './ttsVoice';

const PreferencesContext = createContext(null);
export function BuddyPreferencesProvider({ children }) {
  const { user } = useAuth();
  const userId = user?.id || user?.email || null;
  const currentId = useRef(userId);
  currentId.current = userId;
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const queue = useRef(Promise.resolve());
  const source = saved?.userId === userId ? saved.settings : user?.settings;
  const buddy = useMemo(() => normalizeBuddy(source?.buddy), [source?.buddy]);
  const navigation = useMemo(() => normalizeNavigation(source?.navigation?.bottomNavigation), [source?.navigation]);
  const fishing = useMemo(() => normalizeFishing(source?.fishing), [source?.fishing]);
  useEffect(() => { setPreferredTtsVoice(buddy.voiceId); setActiveBuddyAudio(buddy); }, [buddy, userId]);
  const savePreferences = useCallback((section, value) => {
    if (!userId) return Promise.reject(new Error('Bitte melde dich an, um deine Einstellungen zu speichern.'));
    const owner = userId;
    const write = async () => {
      if (currentId.current !== owner) throw new Error('Die Anmeldung hat sich geändert.');
      setSaving(true);
      try {
        const updated = await auth.updateMe({ settings: { [section]: value } });
        if (currentId.current === owner) setSaved({ userId: owner, settings: updated.settings });
        return updated;
      } finally { if (currentId.current === owner) setSaving(false); }
    };
    const pending = queue.current.then(write, write);
    queue.current = pending.catch(() => {});
    return pending;
  }, [userId]);
  const value = useMemo(() => ({ userId, buddy, activeBuddy: BUDDIES[buddy.avatarId], navigation, fishing, saving, canSave: !!userId,
    saveBuddy: next => savePreferences('buddy', normalizeBuddy({ ...next, chosen: true })),
    saveNavigation: next => savePreferences('navigation', { bottomNavigation: normalizeNavigation(next) }),
    saveFishing: next => savePreferences('fishing', normalizeFishing(next)),
  }), [buddy, navigation, fishing, saving, userId, savePreferences]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
export function useBuddyPreferences() {
  const context = useContext(PreferencesContext);
  // Standalone legacy surfaces and component tests can render without the app shell.
  return context || { buddy: normalizeBuddy(), activeBuddy: BUDDIES.female_default, navigation: normalizeNavigation(), fishing: normalizeFishing(), saving: false, canSave: false };
}
