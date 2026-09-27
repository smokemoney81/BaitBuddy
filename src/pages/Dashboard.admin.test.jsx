import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

const me = vi.hoisted(() => ({ current: null }));

vi.mock('@/api/auth', () => ({ auth: { me: vi.fn(async () => me.current) } }));
vi.mock('@/api/frontendClient', () => ({ functions: { invoke: vi.fn(async () => ({})) } }));
vi.mock('@/lib/BuddyPreferencesContext', () => ({ useBuddyPreferences: () => ({ buddy: { chosen: false } }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
vi.mock('@/hooks/usePredictivePrefetch', () => ({ usePredictivePrefetch: () => {} }));
vi.mock('@/hooks/useDashboardData', () => ({
  useDashboardData: () => ({ data: {}, isLoading: false, error: null, refetch: vi.fn(async () => {}), invalidateCache: vi.fn() }),
}));
vi.mock('@/components/layout/PageContainer', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('@/components/utils/SuspenseWithErrorBoundary', () => ({ default: ({ children }) => <>{children}</> }));
vi.mock('@/components/dashboard/DashboardOverview', () => ({ default: () => null }));
vi.mock('@/components/dashboard/SchonzeitWarner', () => ({ default: () => null }));
vi.mock('@/components/dashboard/OfflineCacheIndicator', () => ({ default: () => null }));
vi.mock('@/components/dashboard/FishingRecommendationCard', () => ({ default: () => null }));
vi.mock('@/components/dashboard/BuddyInsightCard', () => ({ default: () => null }));
vi.mock('@/components/dashboard/AudioNotesWidget', () => ({ default: () => null }));
vi.mock('@/components/community/CommunityPostDialog', () => ({ default: () => null }));
vi.mock('@/components/weather/WeatherWarningBanner', () => ({ default: () => null }));
vi.mock('@/components/referral/ReferralInvitePopup', () => ({ default: () => null }));

const { default: Dashboard } = await import('./Dashboard');

afterEach(() => cleanup());

describe('Dashboard — Admin-Zugang', () => {
  it('zeigt dem Superuser den Einstieg in den Admin-Bereich', async () => {
    me.current = { id: 'su', email: 'kaisaschnitt99@gmail.com', is_superuser: true };
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    const link = await screen.findByRole('link', { name: /Admin-Bereich/ });
    expect(link).toHaveAttribute('href', '/Admin');
  });

  it('zeigt ihn niemandem sonst, auch keinem normalen Admin', async () => {
    me.current = { id: 'a1', email: 'admin@baitbuddy.test', is_admin: true, is_superuser: false };
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await screen.findByRole('button', { name: /Erlebnis mit der Community teilen/ });
    expect(screen.queryByRole('link', { name: /Admin-Bereich/ })).toBeNull();
  });
});
