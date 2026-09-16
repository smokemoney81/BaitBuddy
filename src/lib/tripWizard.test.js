import { describe, it, expect } from 'vitest';
import {
  resolveQuickDate, defaultChecklist, buildPlanPayload,
  stepComplete, createInitialWizardState, WIZARD_STEPS,
  missingChecklistItems, ownsChecklistItem,
} from './tripWizard';

describe('resolveQuickDate', () => {
  it('resolves today and tomorrow', () => {
    const now = new Date('2026-09-15T12:00:00');
    expect(resolveQuickDate('today', now)).toBe('2026-09-15');
    expect(resolveQuickDate('tomorrow', now)).toBe('2026-09-16');
  });
  it('resolves weekend to the upcoming Saturday', () => {
    // 2026-09-15 is a Tuesday -> next Saturday 2026-09-19
    expect(resolveQuickDate('weekend', new Date('2026-09-15T12:00:00'))).toBe('2026-09-19');
    // On a Saturday, stays that Saturday
    expect(resolveQuickDate('weekend', new Date('2026-09-19T12:00:00'))).toBe('2026-09-19');
    // On a Sunday -> next Saturday
    expect(resolveQuickDate('weekend', new Date('2026-09-20T12:00:00'))).toBe('2026-09-26');
  });
});

describe('defaultChecklist', () => {
  it('always includes the base items', () => {
    const list = defaultChecklist({});
    expect(list).toEqual(expect.arrayContaining(['Angelschein', 'Kescher', 'Abhakmatte', 'Getränke']));
  });
  it('adds predator gear for Hecht/spin and carp gear for Karpfen', () => {
    expect(defaultChecklist({ target_fish: 'Hecht' })).toEqual(expect.arrayContaining(['Stahl-/Hardmono-Vorfach']));
    expect(defaultChecklist({ target_fish: 'Karpfen' })).toEqual(expect.arrayContaining(['Bissanzeiger', 'Futter']));
  });
  it('adds a head lamp for late starts and has no duplicates', () => {
    const list = defaultChecklist({ start_time: '20:00' });
    expect(list).toContain('Kopflampe');
    expect(new Set(list).size).toBe(list.length);
  });
});

describe('buildPlanPayload', () => {
  it('maps wizard state to a FishingPlan payload', () => {
    const state = {
      target_fish: 'Hecht',
      spot: { name: 'Bleibtreusee', water_type: 'See', lat: 52.5, lon: 13.2 },
      date: '2026-09-19', start_time: '06:30', end_time: '11:00',
      method: 'Spinnfischen', bait: 'Gummifisch',
      gear_items: [{ name: 'Spinnrute', packed: true }, { name: 'Rolle', packed: false }],
      gear_note: 'Box A',
      rules: [{ fish: 'Hecht', min_size_cm: 50 }], rules_ack: true,
      checklist: ['Angelschein', 'Kescher'],
    };
    const p = buildPlanPayload(state);
    expect(p.target_fish).toBe('Hecht');
    expect(p.title).toBe('Hecht · Bleibtreusee');
    expect(p.spot_info).toMatchObject({ name: 'Bleibtreusee', lat: 52.5, lon: 13.2 });
    expect(p.planned_date).toContain('2026-09-19');
    expect(p.steps).toEqual(['Angelschein', 'Kescher']);
    expect(p.details.method).toBe('Spinnfischen');
    expect(p.details.duration_hours).toBe(4.5);
    expect(p.details.gear).toContain('Box A');
    expect(p.details.gear).toContain('Spinnrute'); // packed gear name included
    expect(p.details.gear).not.toContain('Rolle'); // unpacked gear excluded
    expect(p.details.rules_ack).toBe(true);
  });

  it('handles overnight duration and empty title fallback', () => {
    const p = buildPlanPayload({ start_time: '22:00', end_time: '02:00' });
    expect(p.details.duration_hours).toBe(4);
    expect(p.title).toBe('Angelausflug');
    expect(p.planned_date).toBeNull();
  });
});

describe('createInitialWizardState round-trips through buildPlanPayload', () => {
  it('rebuilds equivalent core fields from a saved plan', () => {
    const plan = {
      title: 'Mein Trip', target_fish: 'Zander',
      spot_info: { name: 'Rhein', water_type: 'Fluss', lat: 50, lon: 7 },
      planned_date: '2026-09-20T05:30:00.000Z',
      steps: ['Angelschein'],
      details: { method: 'Dropshot', bait: 'Gummifisch', start_time: '05:30', end_time: '09:30', rules_ack: true },
    };
    const state = createInitialWizardState(plan);
    expect(state.target_fish).toBe('Zander');
    expect(state.spot.name).toBe('Rhein');
    expect(state.method).toBe('Dropshot');
    expect(state.checklist).toEqual(['Angelschein']);
    const payload = buildPlanPayload(state);
    expect(payload.target_fish).toBe('Zander');
    expect(payload.details.bait).toBe('Gummifisch');
  });
});

describe('stepComplete', () => {
  it('evaluates each step from the state', () => {
    const state = createInitialWizardState();
    expect(stepComplete(state, 'target')).toBe(false);
    state.target_fish = 'Hecht';
    expect(stepComplete(state, 'target')).toBe(true);
    state.spot = { name: 'See', lat: 52, lon: 13 };
    state.date = '2026-09-20';
    expect(stepComplete(state, 'conditions')).toBe(true); // coords + date
    expect(stepComplete(state, 'summary')).toBe(true);
  });
});

it('exposes 9 steps ending in summary', () => {
  expect(WIZARD_STEPS).toHaveLength(9);
  expect(WIZARD_STEPS[WIZARD_STEPS.length - 1].id).toBe('summary');
});

describe('missingChecklistItems', () => {
  it('meldet ohne erfasste Ausruestung NICHTS als fehlend', () => {
    // Sonst staende bei jedem neuen Nutzer die komplette Liste als Mangel da,
    // obwohl er die Sachen sehr wohl besitzt.
    expect(missingChecklistItems(['Kescher', 'Zange'], [])).toEqual([]);
    expect(missingChecklistItems(['Kescher'], null)).toEqual([]);
  });

  it('erkennt vorhandene Ausruestung trotz abweichender Schreibweise', () => {
    const gear = [{ name: 'Kescher gummiert 70 cm' }, { name: 'Lösezange lang' }];
    expect(missingChecklistItems(['Kescher', 'Lösezange'], gear)).toEqual([]);
  });

  it('nennt genau die Punkte ohne passende Ausruestung', () => {
    const gear = [{ name: 'Kescher gummiert' }];
    expect(missingChecklistItems(['Kescher', 'Abhakmatte'], gear)).toEqual(['Abhakmatte']);
  });

  it('akzeptiert Ausruestung auch als reine Zeichenketten', () => {
    expect(missingChecklistItems(['Kescher'], ['Kescher klein'])).toEqual([]);
  });

  it('ignoriert Ausruestung ohne Namen', () => {
    const gear = [{ name: '' }, {}, null, { name: 'Kescher' }];
    expect(missingChecklistItems(['Kescher', 'Zange'], gear)).toEqual(['Zange']);
  });

  it('kommt mit unbrauchbarer Checkliste zurecht', () => {
    expect(missingChecklistItems(null, [{ name: 'Kescher' }])).toEqual([]);
    expect(missingChecklistItems(['', null, 'Zange'], [{ name: 'Kescher' }])).toEqual(['Zange']);
  });
});

describe('ownsChecklistItem', () => {
  it('trifft ueber einen aussagekraeftigen Wortstamm', () => {
    expect(ownsChecklistItem('Stahl-/Hardmono-Vorfach', ['Hardmono Vorfach 0,60 mm'])).toBe(true);
  });

  it('laesst sich nicht von kurzen Allerweltswoertern taeuschen', () => {
    // "Zange" (5) traegt, "mm" oder "cm" duerfen nicht als Treffer zaehlen.
    expect(ownsChecklistItem('Zange', ['Spinnrute 2,70 m'])).toBe(false);
  });

  it('meldet fuer leere Eingaben keinen Besitz', () => {
    expect(ownsChecklistItem('', ['Kescher'])).toBe(false);
    expect(ownsChecklistItem('Kescher', [])).toBe(false);
  });
});
