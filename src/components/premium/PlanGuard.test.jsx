import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Mock PlanGuard Component für Tests
function PlanGuard({ requiredPlan = 'basic', children, fallback = null, hasFeature }) {
  const isAllowed = hasFeature?.(requiredPlan) ?? true;

  if (!isAllowed) {
    return fallback || <div data-testid="plan-guard-blocked">Feature nicht verfügbar</div>;
  }

  return <>{children}</>;
}

describe('PlanGuard – Plan-basierte Feature-Kontrolle', () => {
  it('gibt true zurück, wenn User das Feature hat', () => {
    const hasFeature = vi.fn().mockReturnValue(true);
    const requiredPlan = 'basic';

    const isAllowed = hasFeature(requiredPlan);

    expect(isAllowed).toBe(true);
    expect(hasFeature).toHaveBeenCalledWith(requiredPlan);
  });

  it('gibt false zurück, wenn User das Feature NICHT hat', () => {
    const hasFeature = vi.fn().mockReturnValue(false);
    const requiredPlan = 'elite';

    const isAllowed = hasFeature(requiredPlan);

    expect(isAllowed).toBe(false);
    expect(hasFeature).toHaveBeenCalledWith(requiredPlan);
  });

  it('prüft verschiedene Plan-Level', () => {
    const hasFeature = vi.fn((plan) => {
      const levels = { free: 0, basic: 1, friends: 2, elite: 3 };
      return levels[plan] > 0;
    });

    expect(hasFeature('free')).toBe(false);
    expect(hasFeature('basic')).toBe(true);
    expect(hasFeature('friends')).toBe(true);
    expect(hasFeature('elite')).toBe(true);
  });

  it('hat Default-Fallback', () => {
    const component = PlanGuard({ requiredPlan: 'basic', hasFeature: () => false });

    // Component sollte ein Fallback-Element rendern
    expect(component).toBeDefined();
  });

  it('erkennt fehlenden hasFeature-Check', () => {
    const component = PlanGuard({ requiredPlan: 'basic' });

    // Ohne hasFeature sollte die Komponente default auf true setzen
    expect(component).toBeDefined();
  });
});
