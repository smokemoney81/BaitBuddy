import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BUDDY_ACTIONS,
  ACTION_TYPES,
  ACTION_ALIASES,
  NAVIGATE_PAGES,
  buildActionPromptSection,
} from '../../backend/src/lib/buddyActionCatalog.js';
import { resolvePage } from '@/lib/voicePages';

// Der Aktions-Katalog erzeugt den Prompt-Abschnitt, ausgeführt werden die
// Aktionen aber in `src/utils/buddyActions.js`. Beide Seiten waren bereits
// einmal auseinandergelaufen: Der Client konnte `create_trip`,
// `post_community`, `support_ticket` und `open_url`, der Prompt nannte nur drei
// Aktionen — vier Fähigkeiten konnten deshalb nie ausgelöst werden.
//
// Dieser Test liest die tatsächlich behandelten Typen aus dem Handler und
// vergleicht sie mit dem Katalog.
function handledActionTypes() {
  const source = readFileSync(resolve(__dirname, '../utils/buddyActions.js'), 'utf8');
  const types = new Set();
  for (const match of source.matchAll(/action\.type === '([a-z_]+)'/g)) {
    types.add(match[1]);
  }
  return types;
}

describe('Aktions-Katalog ↔ Client-Handler', () => {
  it('der Client fuehrt jede dokumentierte Aktion aus', () => {
    const handled = handledActionTypes();
    const missing = ACTION_TYPES.filter((type) => !handled.has(type));
    expect(missing, 'Im Prompt dokumentiert, aber vom Client nicht ausgefuehrt').toEqual([]);
  });

  it('jede vom Client ausgefuehrte Aktion ist dokumentiert oder ein bekanntes Synonym', () => {
    const documented = new Set([...ACTION_TYPES, ...Object.keys(ACTION_ALIASES)]);
    const undocumented = [...handledActionTypes()].filter((type) => !documented.has(type));
    expect(undocumented, 'Vom Client ausgefuehrt, aber dem Modell nie mitgeteilt').toEqual([]);
  });

  it('jedes Synonym zeigt auf eine dokumentierte Aktion', () => {
    for (const target of Object.values(ACTION_ALIASES)) {
      expect(ACTION_TYPES).toContain(target);
    }
  });
});

describe('Katalog-Invarianten', () => {
  it('hat eindeutige Typen und vollstaendige Eintraege', () => {
    expect(new Set(ACTION_TYPES).size).toBe(ACTION_TYPES.length);
    for (const action of BUDDY_ACTIONS) {
      expect(action.summary).toBeTruthy();
      expect(action.example).toContain(`"type":"${action.type}"`);
      expect(() => JSON.parse(action.example)).not.toThrow();
    }
  });

  it('nennt nur Seiten, die die Sprachauflösung kennt', () => {
    const unresolvable = NAVIGATE_PAGES.filter((page) => !resolvePage(page));
    expect(unresolvable, 'Im Prompt erlaubt, aber nicht aufloesbar').toEqual([]);
  });
});

describe('buildActionPromptSection', () => {
  it('nennt jede Aktion mit ihrem Beispiel', () => {
    const section = buildActionPromptSection();
    for (const action of BUDDY_ACTIONS) {
      expect(section).toContain(action.example);
      expect(section).toContain(action.summary);
    }
  });

  it('erklaert das Blockformat und die Nachfrage-Regel', () => {
    const section = buildActionPromptSection();
    expect(section).toContain('<<ACTION>>');
    expect(section).toContain('<<END>>');
    expect(section).toContain('frag nach, statt sie zu erfinden');
  });
});
