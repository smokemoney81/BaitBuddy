import { describe, it, expect } from 'vitest';
import { FEDERAL_STATES } from '@/components/rules/rule-utils';
import { FEDERAL_STATE_NAMES } from '../../backend/src/lib/personalizationEngine.js';

// Die Bundesland-Kennungen leben an zwei Stellen: im Frontend als Auswahlliste
// (rule-utils.jsx, genutzt von Regelwerk, Schonzeiten und dem Onboarding) und im
// Backend als Namensauflösung für den Buddy-Prompt. Ein Backend-Import der
// .jsx-Datei kommt nicht in Frage, also sichert dieser Test den Gleichlauf —
// laufen sie auseinander, verschwindet die Region still aus der
// Personalisierung, obwohl der Nutzer sie angegeben hat.
describe('Bundesland-Kennungen Frontend ↔ Backend', () => {
  it('deckt dieselben Kennungen ab', () => {
    const frontend = FEDERAL_STATES.map((state) => state.id).sort();
    const backend = Object.keys(FEDERAL_STATE_NAMES).sort();
    expect(backend).toEqual(frontend);
  });

  it('nutzt dieselben Namen', () => {
    for (const state of FEDERAL_STATES) {
      expect(FEDERAL_STATE_NAMES[state.id]).toBe(state.name);
    }
  });

  it('umfasst alle 16 Bundeslaender', () => {
    expect(FEDERAL_STATES).toHaveLength(16);
  });
});
