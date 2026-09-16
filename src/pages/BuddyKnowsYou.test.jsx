import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BuddyKnowsYou from './BuddyKnowsYou';
import { normalizeFishing, normalizeAngler } from '@/lib/buddyPreferences';

const prefs = vi.hoisted(() => ({ current: null }));
const api = vi.hoisted(() => ({ getProfile: vi.fn() }));

vi.mock('@/lib/BuddyPreferencesContext', () => ({ useBuddyPreferences: () => prefs.current }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/api/frontendClient', () => ({ personalization: { getProfile: (...a) => api.getProfile(...a) } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const PROFILE = {
  tier: 'pro',
  detail: 'normal',
  personalized: true,
  profile: {},
  patterns: {
    enoughData: true,
    total: 9,
    patterns: [
      { id: 'top_species', label: 'Meistgefangene Art', value: 'Zander', detail: '5 von 9 Fängen (56 %)' },
    ],
  },
  gear: { known: ['Spinnrute 2,70 m'], total: 1 },
  trips: [{ title: 'Rheintour', targetFish: 'Zander', plannedDate: '2026-10-01T06:00:00.000Z' }],
  incompleteSources: [],
};

function setup({ fishing = {}, angler = {}, profile = PROFILE } = {}) {
  const saveFishing = vi.fn().mockResolvedValue({});
  const saveAngler = vi.fn().mockResolvedValue({});
  prefs.current = {
    fishing: normalizeFishing(fishing),
    angler: normalizeAngler(angler),
    saveFishing,
    saveAngler,
    canSave: true,
    saving: false,
  };
  api.getProfile.mockResolvedValue(profile);
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BuddyKnowsYou />
      </QueryClientProvider>
    </MemoryRouter>
  );
  return { saveFishing, saveAngler };
}

// Vitest laeuft hier ohne `globals: true`, deshalb registriert Testing Library
// kein automatisches Cleanup — ohne das haengen die Renders der Vortests im DOM
// und jede Abfrage findet die Elemente mehrfach.
beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BuddyKnowsYou', () => {
  // "Zander" steht auch in den Auswahllisten zum Ergaenzen. Ueber den
  // Entfernen-Knopf ist eindeutig, dass der Wert als gespeicherte Angabe
  // angezeigt wird.
  it('zeigt die gespeicherten Zielfische und Methoden', async () => {
    setup({ fishing: { targetSpecies: ['Zander'], methods: ['Dropshot'] } });

    expect(await screen.findByRole('button', { name: 'Zander entfernen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dropshot entfernen' })).toBeInTheDocument();
  });

  it('loescht eine falsche Annahme auf Klick', async () => {
    const { saveFishing } = setup({ fishing: { targetSpecies: ['Zander', 'Hecht'] } });

    await userEvent.click(await screen.findByRole('button', { name: 'Zander entfernen' }));

    await waitFor(() => expect(saveFishing).toHaveBeenCalledWith(
      expect.objectContaining({ targetSpecies: ['Hecht'] })
    ));
  });

  it('ergaenzt ein No-Go als Freitext', async () => {
    const { saveAngler } = setup();

    // Jeder Abschnitt hat einen eigenen "Hinzufuegen"-Knopf — auf den der
    // No-Go-Sektion eingrenzen.
    const section = screen.getByRole('heading', { name: 'No-Gos' }).closest('section');
    await userEvent.type(screen.getByLabelText(/No-Go ergänzen/), 'kein Nachtangeln');
    await userEvent.click(within(section).getByRole('button', { name: /Hinzufügen/ }));

    await waitFor(() => expect(saveAngler).toHaveBeenCalledWith(
      expect.objectContaining({ noGos: ['kein Nachtangeln'] })
    ));
  });

  it('zeigt abgeleitete Muster mit ihrer Stichprobe', async () => {
    setup();

    expect(await screen.findByText('5 von 9 Fängen (56 %)')).toBeInTheDocument();
    const section = screen.getByRole('heading', { name: 'Erkannte Muster' }).closest('section');
    expect(within(section).getByText('Meistgefangene Art')).toBeInTheDocument();
    expect(within(section).getByText('Zander')).toBeInTheDocument();
  });

  it('sagt klar, wenn die Datenlage fuer Muster nicht reicht', async () => {
    setup({ profile: { ...PROFILE, patterns: { enoughData: false, total: 2, patterns: [] } } });

    expect(await screen.findByText(/Erst 2 Fänge erfasst/)).toBeInTheDocument();
  });

  it('unterscheidet "keine Faenge" von "zu wenige Faenge"', async () => {
    setup({ profile: { ...PROFILE, patterns: { enoughData: false, total: 0, patterns: [] } } });

    expect(await screen.findByText(/Noch keine Fänge erfasst/)).toBeInTheDocument();
  });

  it('weist auf nicht lesbare Quellen hin', async () => {
    setup({ profile: { ...PROFILE, incompleteSources: ['catches'] } });

    expect(await screen.findByText(/nicht lesen/)).toBeInTheDocument();
  });

  it('erklaert einem Konto ohne Plan, dass nichts dauerhaft personalisiert wird', async () => {
    setup({ profile: { ...PROFILE, personalized: false } });

    expect(await screen.findByText(/Noch keine dauerhafte Personalisierung/)).toBeInTheDocument();
  });
});
