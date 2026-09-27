import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import VoicePageGuide from './VoicePageGuide';
import { speakWithFallback } from '@/components/utils/elevenLabsTTS';
import { isVoiceSpeaking } from '@/lib/voiceActivity';
import { getActiveAdContexts } from '@/lib/adActiveContext';

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));
vi.mock('@/lib/BuddyPreferencesContext', () => ({
  useBuddyPreferences: () => ({ buddy: { voiceEnabled: true }, onboarding: { completed: true, skipped: false } }),
}));
vi.mock('@/entities/FishingPlan', () => ({
  FishingPlan: { list: vi.fn(async () => []) },
}));
vi.mock('@/lib/audioUnlock', () => ({
  runWhenAudioReady: (fn) => fn(),
}));
vi.mock('@/lib/voicePageGuide', async () => {
  const actual = await vi.importActual('@/lib/voicePageGuide');
  return { ...actual, isVoiceGuideEnabled: () => true };
});
vi.mock('@/components/utils/elevenLabsTTS', () => ({
  speakWithFallback: vi.fn(async () => {}),
}));
vi.mock('@/lib/voiceActivity', () => ({
  isVoiceMuted: () => false,
  isVoiceSpeaking: vi.fn(() => false),
}));
vi.mock('@/lib/adActiveContext', () => ({
  getActiveAdContexts: vi.fn(() => []),
}));

describe('VoicePageGuide — kritische Momente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    isVoiceSpeaking.mockReturnValue(false);
    getActiveAdContexts.mockReturnValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('spricht die Seiten-Einleitung, wenn nichts läuft', async () => {
    vi.useFakeTimers();
    render(<VoicePageGuide pageName="Map" />);
    await vi.advanceTimersByTimeAsync(1300);
    await vi.waitFor(() => expect(speakWithFallback).toHaveBeenCalledWith(expect.stringContaining('Karte')));
  });

  it('redet nicht dazwischen, während der Buddy schon spricht', async () => {
    isVoiceSpeaking.mockReturnValue(true);
    vi.useFakeTimers();
    render(<VoicePageGuide pageName="Map" />);
    await vi.advanceTimersByTimeAsync(1300);
    expect(speakWithFallback).not.toHaveBeenCalled();
  });

  it('redet nicht während einer laufenden Bisserkennung (Drill)', async () => {
    getActiveAdContexts.mockReturnValue(['bite_detector']);
    vi.useFakeTimers();
    render(<VoicePageGuide pageName="Map" />);
    await vi.advanceTimersByTimeAsync(1300);
    expect(speakWithFallback).not.toHaveBeenCalled();
  });
});
