import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdGateProvider, useAdGate } from './AdGate';

vi.mock('@/components/premium/PlanContext', () => ({
  usePlan: () => ({ plan: { id: 'free' }, loading: false }),
}));
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false }), // Gast — einzige Zielgruppe für Interstitials
}));
vi.mock('@/lib/adConfig', () => ({
  getAdConfig: () => ({ ads_enabled: true, guest_interstitial_enabled: true, guest_interstitial_cooldown_s: 0 }),
  loadAdConfig: () => Promise.resolve({ ads_enabled: true, guest_interstitial_enabled: true, guest_interstitial_cooldown_s: 0 }),
}));
vi.mock('@/lib/adAnalytics', () => ({ trackAdEvent: vi.fn() }));
vi.mock('@/components/ads/InterstitialAd', () => ({ canShowInterstitial: () => true }));

function Probe() {
  const { pendingInterstitial } = useAdGate();
  return <div data-testid="pending">{pendingInterstitial ? `${pendingInterstitial.sourceTool}->${pendingInterstitial.targetPath}` : 'none'}</div>;
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AdGateProvider>
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
      </AdGateProvider>
    </MemoryRouter>
  );
}

// Regressionstest zu "keine Werbeanzeige unmittelbar beim App-Start": Ein Gast,
// der direkt (z.B. per Deep-Link) auf einer Haupttool-Route landet, darf beim
// allerersten Render kein Interstitial sehen — vorher galt previousPath ===
// currentPath beim ersten Effect-Lauf, wodurch der Navigations-Guard wirkungslos war.
describe('AdGateProvider – kein Interstitial beim App-Start', () => {
  beforeEach(() => vi.clearAllMocks());

  it('zeigt kein Interstitial beim initialen Mount auf einer Haupttool-Route', async () => {
    renderAt('/Dashboard');
    // Warten, bis der Effect gelaufen ist (setState wäre synchron im Effect).
    await waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('none'));
  });
});
