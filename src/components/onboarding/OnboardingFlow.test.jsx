import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingFlow from './OnboardingFlow';
import { DEFAULT_ONBOARDING, ONBOARDING_STEP_COUNT } from '@/lib/onboarding';
import { normalizeBuddy, normalizeFishing, normalizeAngler, normalizeNavigation } from '@/lib/buddyPreferences';

const preferences = vi.hoisted(() => ({ current: null }));
vi.mock('@/lib/BuddyPreferencesContext', () => ({
  useBuddyPreferences: () => preferences.current,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/actionNotifications', () => ({
  ensurePermission: vi.fn().mockResolvedValue('granted'),
  getPermissionState: vi.fn().mockReturnValue('default'),
}));

function setup(overrides = {}) {
  const saveOnboarding = vi.fn().mockResolvedValue({});
  const saveBuddy = vi.fn().mockResolvedValue({});
  const saveFishing = vi.fn().mockResolvedValue({});
  const saveAngler = vi.fn().mockResolvedValue({});
  const saveNavigation = vi.fn().mockResolvedValue({});
  preferences.current = {
    buddy: normalizeBuddy(),
    fishing: normalizeFishing(),
    angler: normalizeAngler(),
    navigation: normalizeNavigation(),
    onboarding: DEFAULT_ONBOARDING,
    canSave: true,
    saving: false,
    saveOnboarding, saveBuddy, saveFishing, saveAngler, saveNavigation,
    ...overrides,
  };
  return { saveOnboarding, saveBuddy, saveFishing, saveAngler, saveNavigation };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OnboardingFlow', () => {
  it('zeigt den ersten Schritt mit Fortschritt an', () => {
    setup();
    render(<OnboardingFlow />);

    expect(screen.getByText('Willkommen')).toBeInTheDocument();
    expect(screen.getByText(`Schritt 1 von ${ONBOARDING_STEP_COUNT} — du kannst jederzeit abbrechen und später fortsetzen.`)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('erscheint für einen Gast nicht — ohne Konto wäre nichts speicherbar', () => {
    setup({ canSave: false });
    const { container } = render(<OnboardingFlow />);
    expect(container).toBeEmptyDOMElement();
  });

  it('erscheint nach Abschluss nicht erneut', () => {
    setup({ onboarding: { ...DEFAULT_ONBOARDING, completed: true } });
    const { container } = render(<OnboardingFlow />);
    expect(container).toBeEmptyDOMElement();
  });

  it('setzt beim Weitergehen den Schritt fort', async () => {
    const { saveOnboarding } = setup();
    render(<OnboardingFlow />);

    await userEvent.click(screen.getByRole('button', { name: /Weiter/ }));

    await waitFor(() => expect(saveOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ stepIndex: 1 })
    ));
  });

  it('schreibt beim Weitergehen nur den Bereich des aktuellen Schritts', async () => {
    const { saveBuddy, saveFishing, saveAngler } = setup({
      onboarding: { ...DEFAULT_ONBOARDING, stepIndex: 1 }, // Buddy-Schritt
    });
    render(<OnboardingFlow />);

    await userEvent.click(screen.getByRole('button', { name: /Weiter/ }));

    await waitFor(() => expect(saveBuddy).toHaveBeenCalled());
    expect(saveFishing).not.toHaveBeenCalled();
    expect(saveAngler).not.toHaveBeenCalled();
  });

  it('übernimmt eine Mehrfachauswahl in den Entwurf', async () => {
    const { saveFishing } = setup({
      onboarding: { ...DEFAULT_ONBOARDING, stepIndex: 5 }, // Methoden
    });
    render(<OnboardingFlow />);

    await userEvent.click(screen.getByRole('button', { name: /Dropshot/ }));
    await userEvent.click(screen.getByRole('button', { name: /Weiter/ }));

    await waitFor(() => expect(saveFishing).toHaveBeenCalledWith(
      expect.objectContaining({ methods: ['Dropshot'] })
    ));
  });

  it('begrenzt die Navigations-Schwerpunkte auf vier', async () => {
    setup({
      onboarding: { ...DEFAULT_ONBOARDING, stepIndex: 12 }, // Schwerpunkte
      navigation: ['Dashboard', 'Map', 'Community', 'Profile'],
    });
    render(<OnboardingFlow />);

    // Vier sind bereits gewählt, jede weitere Option ist deaktiviert.
    expect(screen.getByRole('button', { name: /Wetter & Prognosen/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Karte & Gewässer/ })).toBeEnabled();
  });

  it('merkt sich beim Überspringen den erreichten Schritt', async () => {
    const { saveOnboarding } = setup({ onboarding: { ...DEFAULT_ONBOARDING, stepIndex: 3 } });
    render(<OnboardingFlow />);

    await userEvent.click(screen.getByRole('button', { name: 'Später' }));

    await waitFor(() => expect(saveOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ skipped: true, stepIndex: 3 })
    ));
  });

  it('schließt auf dem letzten Schritt ab', async () => {
    const { saveOnboarding } = setup({
      onboarding: { ...DEFAULT_ONBOARDING, stepIndex: ONBOARDING_STEP_COUNT - 1 },
    });
    render(<OnboardingFlow />);

    await userEvent.click(screen.getByRole('button', { name: /Fertig/ }));

    await waitFor(() => expect(saveOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ completed: true })
    ));
  });

  it('sperrt Zurück auf dem ersten Schritt', () => {
    setup();
    render(<OnboardingFlow />);
    expect(screen.getByRole('button', { name: /Zurück/ })).toBeDisabled();
  });
});
