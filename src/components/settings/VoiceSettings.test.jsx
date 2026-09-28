import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Plan-Level pro Test steuerbar: 0 = Free, 2 = Pro, 3 = Ultimate (elite).
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

// Regressionstests: Es gibt keine Männlich/Weiblich-Auswahl mehr (früher
// "Daniel"/"Matilda") — eine einzige weibliche Stimme für alle, nur die
// Technik (Gerät vs. Premium-Server) hängt vom Tarif ab (ab Pro).
describe('VoiceSettings – KI-Buddy-Stimme (Pro-Gate, eine Stimme für alle)', () => {
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

  it('zeigt die Gerätestimme + Upgrade-Hinweis ohne Pro-Plan', async () => {
    renderSettings();

    expect(await screen.findByText('Schnelle Gerätestimme')).toBeInTheDocument();
    expect(screen.getByText(/Die natürliche Premium-Stimme ist ab dem Pro-Plan enthalten/)).toBeInTheDocument();
    expect(screen.getByLabelText('Pro-Plan ansehen')).toBeInTheDocument();
  });

  it('zeigt die Premium-Stimme ohne Upgrade-Hinweis ab dem Pro-Plan', async () => {
    planState.planLevel = 2;
    renderSettings();

    expect(await screen.findByText('Premium-Stimme')).toBeInTheDocument();
    expect(screen.queryByText(/ist ab dem Pro-Plan enthalten/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Pro-Plan ansehen')).not.toBeInTheDocument();
  });

  it('zeigt die Premium-Stimme auch im Ultimate-Plan', async () => {
    planState.planLevel = 3;
    renderSettings();

    expect(await screen.findByText('Premium-Stimme')).toBeInTheDocument();
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

describe('VoiceSettings – Aktivierungswort', () => {
  beforeEach(() => {
    localStorage.clear();
    planState.planLevel = 0;
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

  it('ist standardmäßig aus und lässt sich einschalten', async () => {
    const changed = vi.fn();
    window.addEventListener('privacy-prefs-changed', changed);
    renderSettings();

    const toggle = await screen.findByRole('switch', { name: /Aktivierungswort/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(JSON.parse(localStorage.getItem('bb_privacy_prefs')).wakeWord).toBe(true);
    // Der globale Listener startet über dieses Ereignis sofort, ohne Speichern-Knopf.
    expect(changed).toHaveBeenCalled();
    window.removeEventListener('privacy-prefs-changed', changed);
  });
});
