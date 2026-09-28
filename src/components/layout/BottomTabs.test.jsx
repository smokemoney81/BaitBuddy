import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import BottomTabs from './BottomTabs';

const tools = vi.hoisted(() => ({ current: null }));

vi.mock('@/hooks/useTool', () => ({ useTool: () => tools.current }));
vi.mock('@/lib/NavigationContext', () => ({
  useNavigationContext: () => ({ switchTab: vi.fn(), getTabStack: () => [] }),
}));
vi.mock('@/components/utils/tracker', () => ({ trackFeatureClick: vi.fn() }));
vi.mock('@/hooks/useBuddyActivity', () => ({ useBuddyActivity: () => 'idle' }));
vi.mock('@/lib/voiceActivity', () => ({ isVoiceSpeaking: () => false }));
vi.mock('@/hooks/useVoiceActivity', () => ({ useVoiceSpeaking: () => false }));
vi.mock('@/lib/buddyActivity', () => ({ isBuddyHapticEnabled: () => false }));
vi.mock('@/components/utils/elevenLabsTTS', () => ({ cancelElevenLabs: vi.fn() }));

function setup({ lockedRoutes = [] } = {}) {
  tools.current = {
    getToolByRoute: (route) => (
      lockedRoutes.includes(route) ? { id: route, requires: 'pro' } : undefined
    ),
    isToolAccessible: () => false,
  };
  render(<MemoryRouter initialEntries={['/Map']}><BottomTabs /></MemoryRouter>);
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BottomTabs', () => {
  it('stellt die Hauptnavigation als tablist bereit', () => {
    setup();
    const nav = screen.getByRole('tablist', { name: 'Hauptnavigation' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Karte' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Fangbuch' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Profil' })).toBeInTheDocument();
  });

  it('gibt auch einem gesperrten Tab einen zugaenglichen Namen', () => {
    setup({ lockedRoutes: ['/TripPlanner'] });

    const locked = screen.getByRole('tab', { name: 'Trip-Planer' });
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('tab', { name: 'Karte' })).toBeInTheDocument();
  });

  it('markiert die aktive Seite', () => {
    setup();
    expect(screen.getByRole('tab', { name: 'Karte' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Fangbuch' })).toHaveAttribute('aria-selected', 'false');
  });
});
