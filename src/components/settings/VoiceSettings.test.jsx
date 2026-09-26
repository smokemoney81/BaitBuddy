import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Plan-Level pro Test steuerbar: 0 = Free, 3 = Ultimate (elite).
const planState = { planLevel: 0 };

vi.mock('@/components/premium/PlanContext', () => ({
  usePlan: () => ({ planLevel: planState.planLevel }),
}));
vi.mock('@/api/auth', () => ({
  auth: {
    me: vi.fn(async () => ({ settings: {} })),
    updateMe: vi.fn(async () => ({})),
  },
}));
vi.mock('@/components/utils/elevenLabsTTS', () => ({
  speakWithFallback: vi.fn(async () => {}),
}));

import VoiceSettings from './VoiceSettings';
import { speakWithFallback } from '@/components/utils/elevenLabsTTS';

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <VoiceSettings />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('VoiceSettings – KI-Buddy-Stimme (Ultimate-Gate)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    planState.planLevel = 0;
    // jsdom implementiert ResizeObserver nicht (Radix-Slider braucht ihn).
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('sperrt die weibliche Stimme ohne Ultimate-Plan', async () => {
    renderSettings();

    const femaleOption = await screen.findByRole('radio', { name: /Matilda \(nur mit Ultimate-Plan\)/ });
    fireEvent.click(femaleOption);

    // Auswahl bleibt auf der Standardstimme, localStorage unverändert.
    expect(femaleOption).toHaveAttribute('aria-checked', 'false');
    expect(localStorage.getItem('buddy-tts-voice')).not.toBe('female');
    // Upgrade-Hinweis wird angezeigt.
    expect(screen.getByText(/Premium-Stimmen \(Daniel und Matilda\) sind im Ultimate-Plan enthalten/)).toBeInTheDocument();
  });

  it('erlaubt die weibliche Stimme mit Ultimate-Plan und speichert die Wahl', async () => {
    planState.planLevel = 3;
    renderSettings();

    const femaleOption = await screen.findByRole('radio', { name: 'Stimme Matilda' });
    fireEvent.click(femaleOption);

    expect(femaleOption).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('buddy-tts-voice')).toBe('female');
    // Ohne Ultimate-Sperre gibt es keinen Upgrade-Hinweis.
    expect(screen.queryByText(/Premium-Stimmen \(Daniel und Matilda\) sind im Ultimate-Plan enthalten/)).not.toBeInTheDocument();
  });

  it('setzt die Auswahl auf Standard zurück, wenn der Ultimate-Plan wegfällt', async () => {
    localStorage.setItem('buddy-tts-voice', 'female');
    planState.planLevel = 0;

    renderSettings();

    const maleOption = await screen.findByRole('radio', { name: 'Stimme Daniel' });
    expect(maleOption).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('buddy-tts-voice')).toBe('male');
  });

  it('spielt beim Probehören ein Sample mit der Sprachausgabe ab', async () => {
    renderSettings();

    fireEvent.click(await screen.findByLabelText('Ausgewählte Stimme probehören'));

    expect(speakWithFallback).toHaveBeenCalledWith(
      expect.stringContaining('KI-Buddy'),
      expect.objectContaining({ voiceEnabled: true })
    );
  });
});
