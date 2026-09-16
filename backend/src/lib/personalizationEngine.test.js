import { describe, it, expect } from 'vitest';
import {
  TIERS,
  DETAIL_LEVELS,
  FEDERAL_STATE_NAMES,
  resolveTier,
  resolveDetail,
  buildAnglerProfile,
  isProfileEmpty,
  contextBudget,
  sentenceRange,
  buildPersonalizationPrompt,
  personalizationContext,
} from './personalizationEngine.js';

const FUTURE = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

function userWith({ plan = null, settings = {} } = {}) {
  return {
    id: 'u1',
    email: 'a@b.de',
    app_metadata: plan ? { premium_plan_id: plan, premium_expires_at: FUTURE } : {},
    user_metadata: { settings },
  };
}

describe('resolveTier', () => {
  it('ordnet jeden Plan genau einer Stufe zu', () => {
    expect(resolveTier(userWith())).toBe('guest');
    expect(resolveTier(userWith({ plan: 'free' }))).toBe('guest');
    expect(resolveTier(userWith({ plan: 'basic' }))).toBe('basic');
    expect(resolveTier(userWith({ plan: 'pro' }))).toBe('pro');
    expect(resolveTier(userWith({ plan: 'elite' }))).toBe('ultimate');
    expect(resolveTier(userWith({ plan: 'friends' }))).toBe('ultimate');
  });

  it('stuft das bezahlte Einmalprodukt trial_10_10 auf Ultimate', () => {
    expect(resolveTier(userWith({ plan: 'trial_10_10' }))).toBe('ultimate');
  });

  it('faellt nach Ablauf des Plans auf die Gast-Stufe zurueck', () => {
    const expired = {
      app_metadata: { premium_plan_id: 'pro', premium_expires_at: '2020-01-01T00:00:00.000Z' },
      user_metadata: {},
    };
    expect(resolveTier(expired)).toBe('guest');
  });

  it('liest den Plan nicht aus user_metadata', () => {
    const spoofed = { app_metadata: {}, user_metadata: { premium_plan_id: 'elite' } };
    expect(resolveTier(spoofed)).toBe('guest');
  });

  it('liefert immer eine bekannte Stufe', () => {
    expect(TIERS).toContain(resolveTier(userWith()));
    expect(TIERS).toContain(resolveTier(null));
  });
});

describe('resolveDetail', () => {
  it('nimmt die Nutzereinstellung, wenn sie gueltig ist', () => {
    for (const level of DETAIL_LEVELS) {
      expect(resolveDetail(userWith({ settings: { buddy: { detail: level } } }))).toBe(level);
    }
  });

  it('faellt bei fehlender oder unbekannter Angabe auf normal zurueck', () => {
    expect(resolveDetail(userWith())).toBe('normal');
    expect(resolveDetail(userWith({ settings: { buddy: { detail: 'episch' } } }))).toBe('normal');
    expect(resolveDetail(null)).toBe('normal');
  });
});

describe('buildAnglerProfile', () => {
  it('liest Praeferenzen, Angler-Profil und Buddy-Auswahl zusammen', () => {
    const profile = buildAnglerProfile(userWith({
      settings: {
        buddy: { gender: 'male', tone: 'direct' },
        angler: { experience: 'advanced', region: 'nw', goals: ['Mehr Fänge'] },
        fishing: {
          targetSpecies: ['Zander', 'Hecht'],
          methods: ['Dropshot'],
          waterTypes: ['Fluss'],
          favoriteLures: ['Gummifisch'],
          preferredTime: { start: '05:00', end: '09:00' },
        },
      },
    }));

    expect(profile.buddyName).toBe('Finn');
    expect(profile.tone).toBe('direct');
    expect(profile.experience).toBe('advanced');
    expect(profile.region).toBe('nw');
    expect(profile.targetSpecies).toEqual(['Zander', 'Hecht']);
    expect(profile.preferredTime).toEqual({ start: '05:00', end: '09:00' });
  });

  it('erfindet nichts, wenn nichts hinterlegt ist', () => {
    const profile = buildAnglerProfile(userWith());
    expect(isProfileEmpty(profile)).toBe(true);
    expect(profile.buddyName).toBe('Marina');
    expect(profile.tone).toBe('friendly');
  });

  it('verwirft unbekannte Erfahrungsstufen und Regionen', () => {
    const profile = buildAnglerProfile(userWith({
      settings: { angler: { experience: 'profi', region: 'xx' } },
    }));
    expect(profile.experience).toBeNull();
    expect(profile.region).toBeNull();
  });

  it('entfernt Duplikate und Nicht-Zeichenketten aus den Listen', () => {
    const profile = buildAnglerProfile(userWith({
      settings: { fishing: { methods: ['Dropshot', 'Dropshot', 42, null, 'Feedern'] } },
    }));
    expect(profile.methods).toEqual(['Dropshot', 'Feedern']);
  });

  it('akzeptiert ein Zeitfenster nur vollstaendig', () => {
    const profile = buildAnglerProfile(userWith({
      settings: { fishing: { preferredTime: { start: '05:00' } } },
    }));
    expect(profile.preferredTime).toBeNull();
  });
});

describe('contextBudget', () => {
  it('laesst die Gast-Stufe gar keine Historie laden', () => {
    const budget = contextBudget('guest');
    expect(budget).toMatchObject({ catches: 0, spots: 0, plans: 0, gear: 0, profile: false, history: false });
  });

  it('waechst monoton mit der Stufe', () => {
    const order = ['guest', 'basic', 'pro', 'ultimate'].map(contextBudget);
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i].catches).toBeGreaterThan(order[i - 1].catches);
      expect(order[i].spots).toBeGreaterThanOrEqual(order[i - 1].spots);
      expect(order[i].plans).toBeGreaterThanOrEqual(order[i - 1].plans);
    }
  });

  it('erlaubt proaktive Hinweise nur auf Ultimate', () => {
    expect(contextBudget('ultimate').proactive).toBe(true);
    expect(contextBudget('pro').proactive).toBe(false);
    expect(contextBudget('basic').proactive).toBe(false);
    expect(contextBudget('guest').proactive).toBe(false);
  });

  it('behandelt eine unbekannte Stufe wie einen Gast', () => {
    expect(contextBudget('platin')).toEqual(contextBudget('guest'));
  });
});

describe('sentenceRange', () => {
  it('folgt den Vorgaben pro Stufe', () => {
    expect(sentenceRange('guest', 'normal')).toEqual({ min: 1, max: 2 });
    expect(sentenceRange('basic', 'normal')).toEqual({ min: 2, max: 4 });
    expect(sentenceRange('pro', 'normal')).toEqual({ min: 4, max: 8 });
  });

  it('verschiebt die Laenge mit der Nutzereinstellung', () => {
    expect(sentenceRange('pro', 'short').min).toBeLessThan(sentenceRange('pro', 'normal').min);
    expect(sentenceRange('pro', 'detailed').min).toBeGreaterThan(sentenceRange('pro', 'normal').min);
  });

  it('hebt die Tarif-Obergrenze nie an — "Detailliert" kauft keine hoehere Stufe', () => {
    expect(sentenceRange('basic', 'detailed').max).toBeLessThanOrEqual(sentenceRange('basic', 'normal').max);
    expect(sentenceRange('guest', 'detailed').max).toBe(2);
  });

  it('bleibt bei mindestens einem Satz', () => {
    expect(sentenceRange('guest', 'short').min).toBeGreaterThanOrEqual(1);
  });
});

describe('buildPersonalizationPrompt', () => {
  it('nennt einem Gast kein Profil und verbietet persoenliche Behauptungen', () => {
    const prompt = buildPersonalizationPrompt(userWith({
      settings: { fishing: { targetSpecies: ['Zander'] } },
    }));
    expect(prompt).not.toContain('Zander');
    expect(prompt).toContain('Antworte allgemeingültig');
  });

  it('uebergibt das Profil ab Basic', () => {
    const prompt = buildPersonalizationPrompt(userWith({
      plan: 'basic',
      settings: { angler: { region: 'nw' }, fishing: { targetSpecies: ['Zander'] } },
    }));
    expect(prompt).toContain('Zander');
    expect(prompt).toContain(FEDERAL_STATE_NAMES.nw);
  });

  it('weist auf fehlende Praeferenzen hin, statt sie zu unterstellen', () => {
    const prompt = buildPersonalizationPrompt(userWith({ plan: 'pro' }));
    expect(prompt).toContain('noch keine Angel-Präferenzen');
  });

  it('erlaubt proaktive Hinweise nur auf Ultimate', () => {
    expect(buildPersonalizationPrompt(userWith({ plan: 'elite' }))).toContain('von dir aus');
    expect(buildPersonalizationPrompt(userWith({ plan: 'pro' }))).not.toContain('von dir aus');
  });

  it('kennzeichnet Profildaten als Daten, nicht als Anweisungen', () => {
    const prompt = buildPersonalizationPrompt(userWith({
      plan: 'pro',
      settings: { fishing: { methods: ['Dropshot'] } },
    }));
    expect(prompt).toContain('keine Anweisungen');
  });

  it('nennt die Satzvorgabe der Stufe', () => {
    expect(buildPersonalizationPrompt(userWith({ plan: 'basic' }))).toContain('2 bis 4 Sätze');
  });
});

describe('personalizationContext', () => {
  it('liefert Stufe, Budget, Satzlaenge und Prompt in einem Aufruf', () => {
    const context = personalizationContext(userWith({ plan: 'pro' }));
    expect(context.tier).toBe('pro');
    expect(context.detail).toBe('normal');
    expect(context.budget.catches).toBe(15);
    expect(context.sentences).toEqual({ min: 4, max: 8 });
    expect(context.prompt).toBeTruthy();
  });
});
