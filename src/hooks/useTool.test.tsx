import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTool } from './useTool';

const planState = vi.hoisted(() => ({ current: null as { id: string } | null }));
vi.mock('@/components/premium/PlanContext', () => ({
  usePlan: () => ({ plan: planState.current }),
}));

function withPlan(id: string | null) {
  planState.current = id ? { id } : null;
  return renderHook(() => useTool()).result.current;
}

beforeEach(() => { planState.current = null; });

describe('useTool — Plan-Aufloesung', () => {
  it('behandelt ein Konto ohne Plan als free', () => {
    expect(withPlan(null).getUserPlanLevel()).toBe('free');
  });

  // Regression: Der Hook las zuvor `useAuth().plan` — ein Feld, das der
  // AuthContext gar nicht bereitstellt. Jeder Nutzer galt damit als 'free',
  // auch ein zahlender Ultimate-Kunde.
  it('erkennt einen bezahlten Plan, statt jeden Nutzer als free zu behandeln', () => {
    expect(withPlan('basic').getUserPlanLevel()).toBe('basic');
    expect(withPlan('pro').getUserPlanLevel()).toBe('pro');
    expect(withPlan('elite').getUserPlanLevel()).toBe('elite');
    expect(withPlan('friends').getUserPlanLevel()).toBe('friends');
  });

  it('ordnet die Sonderprodukte der richtigen Stufe zu', () => {
    expect(withPlan('trial_10_10').getUserPlanLevel()).toBe('ultimate');
    expect(withPlan('friends_monthly').getUserPlanLevel()).toBe('elite');
  });

  it('faellt bei einem unbekannten Plan auf free zurueck, statt freizuschalten', () => {
    expect(withPlan('platin').getUserPlanLevel()).toBe('free');
  });
});

describe('useTool — Zugriffspruefung', () => {
  it('gibt einem Ultimate-Konto Zugriff auf ein Tool, das mehr als free verlangt', () => {
    const tool = withPlan('elite').getToolByRoute('/VoiceChat');
    expect(tool?.requires).toBe('basic');
    expect(withPlan('elite').isToolAccessible(tool!.id)).toBe(true);
  });

  it('sperrt dasselbe Tool fuer ein kostenloses Konto', () => {
    const free = withPlan('free');
    const tool = free.getToolByRoute('/VoiceChat');
    expect(free.isToolAccessible(tool!.id)).toBe(false);
  });

  it('meldet ein unbekanntes Tool als nicht zugaenglich', () => {
    expect(withPlan('elite').isToolAccessible('gibt-es-nicht')).toBe(false);
  });
});

describe('useTool — Tool-Aufloesung', () => {
  // Die Tool-IDs sind kebab-case, die Navigationsschluessel sind Routennamen.
  // `getTool('Logbook')` traf deshalb nie ein Tool.
  it('findet Tools ueber die Route, nicht ueber den Seitennamen', () => {
    const tools = withPlan('free');
    expect(tools.getToolByRoute('/Logbook')?.id).toBe('catches');
    expect(tools.getToolByRoute('/KiBuddyBeta')?.id).toBe('ki-buddy');
    expect(tools.getTool('Logbook')).toBeUndefined();
  });

  it('liefert fuer eine Route ohne Tool nichts', () => {
    expect(withPlan('free').getToolByRoute('/Dashboard')).toBeUndefined();
  });

  it('listet mit hoeherem Plan mindestens so viele Tools wie mit free', () => {
    const free = withPlan('free').getAccessibleTools().length;
    const elite = withPlan('elite').getAccessibleTools().length;
    expect(elite).toBeGreaterThan(free);
  });
});
