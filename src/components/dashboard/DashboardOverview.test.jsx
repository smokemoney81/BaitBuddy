import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardOverview from './DashboardOverview';

const gear = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('@/api/frontendClient', () => ({
  entities: { GearItem: { list: (...a) => gear.list(...a) } },
}));
vi.mock('@/components/location/LocationManager', () => ({
  useLocation: () => ({ currentLocation: null, requestGpsLocation: vi.fn() }),
}));
vi.mock('@/hooks/useFishingConditions', () => ({
  useFishingConditions: () => ({ hours: [], window: null, data: null, isLoading: false, hasLocation: false }),
}));
vi.mock('@/components/buddy/BuddyCard', () => ({
  default: ({ message }) => <div data-testid="buddy-card">{message}</div>,
}));
vi.mock('@/components/onboarding/OnboardingFlow', () => ({ default: () => null }));

function setup(props = {}) {
  gear.list.mockResolvedValue([]);
  return render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <DashboardOverview user={{ id: 'u1', full_name: 'Test Angler' }} {...props} />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DashboardOverview — nächste Tour', () => {
  // Die Tour kommt aus der aggregierten Dashboard-Abfrage. Vorher lud die
  // Komponente zusätzlich die komplette Trip-Liste, obwohl das Aggregat bereits
  // abgerufen wurde — genau die Einzelabfrage, die es ersetzen soll.
  it('zeigt die Tour aus dem Aggregat an, ohne sie erneut zu laden', async () => {
    setup({ nextTrip: { name: 'Zandertour Rhein', start_date: '2026-10-04T05:30:00.000Z' } });

    expect(await screen.findByText('Zandertour Rhein')).toBeInTheDocument();
    // Nur die Ausrüstung wird noch einzeln geladen.
    expect(gear.list).toHaveBeenCalledTimes(1);
  });

  it('versteht auch die Feldnamen des Trip-Planers', async () => {
    setup({ nextTrip: { title: 'Hechttour', planned_date: '2026-10-04T05:30:00.000Z' } });
    expect(await screen.findByText('Hechttour')).toBeInTheDocument();
  });

  it('sagt ohne geplante Tour, dass noch keine existiert', async () => {
    setup({ nextTrip: null });
    expect(await screen.findByText('Noch kein Angelausflug geplant')).toBeInTheDocument();
  });

  it('unterscheidet einen Ladefehler von "keine Tour geplant"', async () => {
    const onRetryTrips = vi.fn();
    setup({ nextTrip: null, tripsError: true, onRetryTrips });

    expect(await screen.findByRole('alert')).toHaveTextContent('Deine Trips konnten nicht geladen werden.');
    expect(screen.queryByText('Noch kein Angelausflug geplant')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Erneut versuchen/ }));
    expect(onRetryTrips).toHaveBeenCalled();
  });

  it('nennt die Tour in der Buddy-Ansprache', async () => {
    setup({ nextTrip: { name: 'Zandertour Rhein', start_date: '2026-10-04T05:30:00.000Z' } });
    expect(await screen.findByTestId('buddy-card')).toHaveTextContent('Zandertour Rhein');
  });
});
