import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import React from 'react';

const state = vi.hoisted(() => ({ settings: { ads_enabled: true, all_tools_free: false } }));
vi.mock('@/api/frontendClient', () => ({
  functions: { invoke: vi.fn(async () => ({ plan: { id: 'free', name: 'Kostenlos', is_active: false } })) },
}));
vi.mock('./googlePlayBilling', () => ({ startGooglePlayReconciliation: () => () => {} }));
vi.mock('@/lib/appSettings', () => ({
  APP_SETTINGS_EVENT: 'app-settings-updated',
  loadAppSettings: vi.fn(async () => state.settings),
}));

const { PlanProvider, usePlan } = await import('./PlanContext');

function Probe() {
  const { hasFeature, planLevel, allToolsFree, loading } = usePlan();
  if (loading) return <p>lädt</p>;
  return <p>{`pro=${hasFeature('pro')} elite=${hasFeature('elite')} level=${planLevel} free=${allToolsFree}`}</p>;
}

beforeEach(() => { state.settings = { ads_enabled: true, all_tools_free: false }; });
afterEach(() => cleanup());

describe('PlanContext — Admin-Schalter „alle Tools kostenlos“', () => {
  it('sperrt ohne Schalter nach Plan', async () => {
    render(<PlanProvider><Probe /></PlanProvider>);
    expect(await screen.findByText('pro=false elite=false level=0 free=false')).toBeInTheDocument();
  });

  it('gibt mit Schalter jede Funktion frei', async () => {
    state.settings = { ads_enabled: true, all_tools_free: true };
    render(<PlanProvider><Probe /></PlanProvider>);
    expect(await screen.findByText('pro=true elite=true level=4 free=true')).toBeInTheDocument();
  });

  it('übernimmt ein Umschalten aus dem Admin-Bereich sofort', async () => {
    render(<PlanProvider><Probe /></PlanProvider>);
    await screen.findByText('pro=false elite=false level=0 free=false');
    await act(async () => {
      window.dispatchEvent(new CustomEvent('app-settings-updated', { detail: { ads_enabled: true, all_tools_free: true } }));
    });
    expect(screen.getByText('pro=true elite=true level=4 free=true')).toBeInTheDocument();
  });
});
