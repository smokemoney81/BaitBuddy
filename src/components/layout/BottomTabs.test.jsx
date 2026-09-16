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
vi.mock('@/lib/BuddyPreferencesContext', () => ({
  useBuddyPreferences: () => ({ navigation: ['Dashboard', 'Logbook', 'Weather', 'Community'] }),
}));
vi.mock('@/components/utils/tracker', () => ({ trackFeatureClick: vi.fn() }));

function setup({ lockedRoutes = [] } = {}) {
  tools.current = {
    getToolByRoute: (route) => (
      lockedRoutes.includes(route) ? { id: route, requires: 'pro' } : undefined
    ),
    isToolAccessible: () => false,
  };
  render(<MemoryRouter initialEntries={['/Dashboard']}><BottomTabs /></MemoryRouter>);
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
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Logbook' })).toBeInTheDocument();
  });

  // Regression: Die gesperrte Variante rendert ein <div role="tab"> und hatte
  // kein aria-label. Ein Screenreader meldete nur "Tab", und Abfragen ueber den
  // zugaenglichen Namen fanden den Eintrag nicht mehr.
  it('gibt auch einem gesperrten Tab einen zugaenglichen Namen', () => {
    setup({ lockedRoutes: ['/Weather'] });

    const locked = screen.getByRole('tab', { name: 'Weather' });
    expect(locked).toHaveAttribute('aria-disabled', 'true');
    // Die uebrigen Tabs bleiben erreichbar.
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('markiert die aktive Seite', () => {
    setup();
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Logbook' })).toHaveAttribute('aria-selected', 'false');
  });
});
