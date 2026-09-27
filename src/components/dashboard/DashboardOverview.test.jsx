import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardOverview from './DashboardOverview';

const gear = vi.hoisted(() => ({ list: vi.fn() }));
const spots = vi.hoisted(() => ({ list: vi.fn() }));
const weatherState = vi.hoisted(() => ({ current: null }));

vi.mock('@/api/frontendClient', () => ({
  entities: {
    GearItem: { list: (...a) => gear.list(...a) },
    Spot: { list: (...a) => spots.list(...a) },
  },
}));
vi.mock('@/components/dashboard/DashboardMapPreview', () => ({ default: () => null }));
vi.mock('@/components/location/LocationManager', () => ({
  useLocation: () => ({ currentLocation: null, requestGpsLocation: vi.fn() }),
}));
vi.mock('@/hooks/useFishingConditions', () => ({
  useFishingConditions: () => weatherState.current || { hours: [], window: null, data: null, isLoading: false, hasLocation: false },
}));
vi.mock('@/components/buddy/BuddyCard', () => ({
  default: ({ message }) => <div data-testid="buddy-card">{message}</div>,
}));
vi.mock('@/components/onboarding/OnboardingFlow', () => ({ default: () => null }));

function setup(props = {}) {
  gear.list.mockResolvedValue([]);
  spots.list.mockResolvedValue([]);
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
  weatherState.current = null;
});

describe('DashboardOverview — Wetter', () => {
  it('zeigt sieben Tage aus der echten Forecast-Datenstruktur', async () => {
    weatherState.current = {
      hours: [], window: null, hasLocation: true, isLoading: false,
      data: {
        timezone: 'Europe/Berlin',
        current: { temperature_2m: 17, weather_code: 1, wind_speed_10m: 6, pressure_msl: 1014, relative_humidity_2m: 60, precipitation: 0 },
        daily: {
          time: Array.from({ length: 7 }, (_, i) => 1790460000 + i * 86400),
          weather_code: [1, 2, 3, 61, 1, 2, 3],
          temperature_2m_min: [8, 9, 10, 11, 12, 13, 14],
          temperature_2m_max: [17, 18, 19, 20, 21, 22, 23],
          precipitation_probability_max: [10, 20, 30, 40, 50, 60, 70],
        },
      },
    };
    setup();
    expect(await screen.findByText('7-Tage-Vorhersage')).toBeInTheDocument();
    const forecast = screen.getByLabelText('Wettervorhersage für sieben Tage');
    expect(forecast.children).toHaveLength(7);
    expect(forecast).toHaveTextContent('Heute');
    expect(forecast).toHaveTextContent('70%');
    expect(forecast).toHaveTextContent('23°');
  });
});

describe('DashboardOverview — nächste Tour', () => {
  // Die Tour kommt aus der aggregierten Dashboard-Abfrage. Vorher lud die
  // Komponente zusätzlich die komplette Trip-Liste, obwohl das Aggregat bereits
  // abgerufen wurde — genau die Einzelabfrage, die es ersetzen soll.
  it('zeigt die Tour aus dem Aggregat an, ohne sie erneut zu laden', async () => {
    setup({ nextTrip: { name: 'Zandertour Rhein', start_date: '2026-10-04T05:30:00.000Z' } });

    expect(await screen.findByText('Zandertour Rhein')).toBeInTheDocument();
    // Die Tour wird nicht erneut geladen — einzeln kommen nur Ausrüstung
    // und die Spots für die Kartenvorschau.
    expect(gear.list).toHaveBeenCalledTimes(1);
    expect(spots.list).toHaveBeenCalledTimes(1);
  });

  it('versteht auch die Feldnamen des Trip-Planers', async () => {
    setup({ nextTrip: { title: 'Hechttour', planned_date: '2026-10-04T05:30:00.000Z' } });
    expect(await screen.findByText('Hechttour')).toBeInTheDocument();
  });

  it('sagt ohne geplante Tour, dass noch keine existiert', async () => {
    setup({ nextTrip: null });
    expect(await screen.findByText('Noch nichts geplant')).toBeInTheDocument();
  });

  it('unterscheidet einen Ladefehler von "keine Tour geplant"', async () => {
    const onRetryTrips = vi.fn();
    setup({ nextTrip: null, tripsError: true, onRetryTrips });

    expect(await screen.findByRole('alert')).toHaveTextContent('Deine Trips konnten nicht geladen werden.');
    expect(screen.queryByText('Noch nichts geplant')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Erneut versuchen/ }));
    expect(onRetryTrips).toHaveBeenCalled();
  });

  it('nennt die Tour in der Buddy-Ansprache', async () => {
    setup({ nextTrip: { name: 'Zandertour Rhein', start_date: '2026-10-04T05:30:00.000Z' } });
    expect(await screen.findByTestId('buddy-card')).toHaveTextContent('Zandertour Rhein');
  });
});
