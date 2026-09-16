import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FirstLoginTutorialPrompt from './FirstLoginTutorialPrompt';
import { DEFAULT_TUTORIAL } from '@/lib/tutorial';
import { DEFAULT_ONBOARDING } from '@/lib/onboarding';

const prefs = vi.hoisted(() => ({ current: null }));
const tour = vi.hoisted(() => ({ current: null }));

vi.mock('@/lib/BuddyPreferencesContext', () => ({ useBuddyPreferences: () => prefs.current }));
vi.mock('@/contexts/GuidedTourContext', () => ({ useGuidedTour: () => tour.current }));

function setup({ tutorial = DEFAULT_TUTORIAL, onboarding = { ...DEFAULT_ONBOARDING, completed: true }, canSave = true, tourState = {} } = {}) {
  const startTour = vi.fn();
  const skipTour = vi.fn();
  prefs.current = { tutorial, onboarding, canSave };
  tour.current = { isActive: false, isLoading: false, startTour, skipTour, ...tourState };
  const result = render(<FirstLoginTutorialPrompt />);
  return { startTour, skipTour, ...result };
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FirstLoginTutorialPrompt', () => {
  it('bietet die Tour nach dem Onboarding an', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Kurze Tour durch die App?' })).toBeInTheDocument();
  });

  it('startet die Tour auf Klick', async () => {
    const { startTour } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Tour starten' }));
    expect(startTour).toHaveBeenCalled();
  });

  it('merkt sich ein "Nicht jetzt" im Profil, nicht nur lokal', async () => {
    const { skipTour } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Nicht jetzt' }));
    expect(skipTour).toHaveBeenCalled();
  });

  it('laesst sich schliessen, ohne den gespeicherten Zustand zu aendern', async () => {
    const { skipTour, startTour, container } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Hinweis schließen' }));
    expect(container).toBeEmptyDOMElement();
    expect(skipTour).not.toHaveBeenCalled();
    expect(startTour).not.toHaveBeenCalled();
  });

  it('erscheint nicht, solange das Onboarding laeuft', () => {
    const { container } = setup({ onboarding: DEFAULT_ONBOARDING });
    expect(container).toBeEmptyDOMElement();
  });

  it('erscheint nicht, wenn die Tour bereits laeuft', () => {
    const { container } = setup({ tourState: { isActive: true } });
    expect(container).toBeEmptyDOMElement();
  });

  it('erscheint nicht, solange der Nutzer noch nicht feststeht', () => {
    const { container } = setup({ tourState: { isLoading: true } });
    expect(container).toBeEmptyDOMElement();
  });

  it('erscheint nach Abschluss oder Ueberspringen nicht erneut', () => {
    expect(setup({ tutorial: { ...DEFAULT_TUTORIAL, completed: true } }).container).toBeEmptyDOMElement();
    cleanup();
    expect(setup({ tutorial: { ...DEFAULT_TUTORIAL, skipped: true } }).container).toBeEmptyDOMElement();
  });
});
