// Angelregeln nach Bundesland und Fischart.
// Schonzeiten beziehen sich auf Monat/Tag (jahres-agnostisch).
// Mindestmaße in cm. Tagesquoten wo gesetzlich festgelegt.
// Quelle: Länderfischereigesetze, LFV-Merkblätter (Stand 2026).
//
// Erweiterung: Neue Bundesländer als Einträge in RULES hinzufügen.
// Neue Fischarten innerhalb eines Bundesland-Eintrags ergänzen.

const RULES = {
  NRW: {
    Hecht: {
      closedFrom: '02-01',
      closedTo: '05-15',
      minSizeCm: 60,
      notes: 'Fang-und-Zurück-Gebot während der Schonzeit. Im Sauerland 50 cm.',
    },
    Zander: {
      closedFrom: '03-01',
      closedTo: '05-31',
      minSizeCm: 50,
      notes: null,
    },
    Barsch: {
      closedFrom: null,
      closedTo: null,
      minSizeCm: 20,
      notes: 'Kein gesetzliches Schonmaß in allen Gewässern — Vereinsvorgaben beachten.',
    },
    Karpfen: {
      closedFrom: '04-01',
      closedTo: '05-31',
      minSizeCm: 35,
      notes: null,
    },
    Schleie: {
      closedFrom: '05-16',
      closedTo: '06-30',
      minSizeCm: 25,
      notes: null,
    },
    Forelle: {
      closedFrom: '11-01',
      closedTo: '03-15',
      minSizeCm: 25,
      notes: 'Bachforelle. Regenbogenforelle ganzjährig in zugelassenen Gewässern.',
    },
    Äsche: {
      closedFrom: '03-01',
      closedTo: '05-31',
      minSizeCm: 35,
      notes: 'Bundesartenschutz beachten.',
    },
    Wels: {
      closedFrom: null,
      closedTo: null,
      minSizeCm: 70,
      notes: null,
    },
    Aal: {
      closedFrom: '10-01',
      closedTo: '12-31',
      minSizeCm: 45,
      notes: 'EU-Aalschutzplan: Entnahmelimit je nach Gewässer — Vereinsregeln prüfen.',
    },
    Brachse: {
      closedFrom: '05-01',
      closedTo: '06-15',
      minSizeCm: 25,
      notes: null,
    },
    Rotauge: {
      closedFrom: null,
      closedTo: null,
      minSizeCm: 20,
      notes: null,
    },
    Rapfen: {
      closedFrom: '04-01',
      closedTo: '06-15',
      minSizeCm: 40,
      notes: null,
    },
    Quappe: {
      closedFrom: null,
      closedTo: null,
      minSizeCm: 30,
      notes: null,
    },
  },
  Bayern: {
    Hecht: {
      closedFrom: '02-01',
      closedTo: '04-30',
      minSizeCm: 55,
      notes: null,
    },
    Zander: {
      closedFrom: '02-15',
      closedTo: '05-14',
      minSizeCm: 50,
      notes: null,
    },
    Forelle: {
      closedFrom: '10-01',
      closedTo: '02-28',
      minSizeCm: 27,
      notes: 'Bachforelle.',
    },
  },
  BW: {
    Hecht: {
      closedFrom: '02-01',
      closedTo: '05-14',
      minSizeCm: 60,
      notes: null,
    },
    Zander: {
      closedFrom: '02-01',
      closedTo: '05-14',
      minSizeCm: 50,
      notes: null,
    },
    Forelle: {
      closedFrom: '10-01',
      closedTo: '02-28',
      minSizeCm: 25,
      notes: null,
    },
  },
};

// Aliase für Bundesland-Codes (Eingabetoleranz).
const STATE_ALIASES = {
  'nordrhein-westfalen': 'NRW',
  nrw: 'NRW',
  'north rhine-westphalia': 'NRW',
  bayern: 'Bayern',
  bavaria: 'Bayern',
  'by': 'Bayern',
  'bw': 'BW',
  'baden-württemberg': 'BW',
  'badenwuerttemberg': 'BW',
};

function normalizeState(state) {
  if (!state) return null;
  const key = String(state).toLowerCase().replace(/\s+/g, '-');
  return STATE_ALIASES[key] || RULES[state] ? (STATE_ALIASES[key] || state) : null;
}

// Weiche Namensübereinstimmung: "Hecht" findet auch "hecht", "Esox" etc.
const SPECIES_ALIASES = {
  esox: 'Hecht',
  pike: 'Hecht',
  'sander vitreus': 'Zander',
  pikeperch: 'Zander',
  perch: 'Barsch',
  bass: 'Barsch',
  carp: 'Karpfen',
  tench: 'Schleie',
  trout: 'Forelle',
  grayling: 'Äsche',
  catfish: 'Wels',
  eel: 'Aal',
  bream: 'Brachse',
  roach: 'Rotauge',
};

function normalizeSpecies(species) {
  if (!species) return null;
  const key = String(species).toLowerCase().trim();
  if (SPECIES_ALIASES[key]) return SPECIES_ALIASES[key];
  // Direkttreffer: ersten Buchstaben groß
  const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
  return capitalized;
}

/**
 * Liefert die Angelregeln für eine Fischart in einem Bundesland.
 *
 * @param {string} species  Fischart (deutsch oder Alias)
 * @param {string} state    Bundesland-Code (NRW, Bayern, BW) oder Vollname
 * @returns {{ found: boolean, species: string, state: string, closedFrom: string|null, closedTo: string|null, minSizeCm: number|null, notes: string|null }}
 */
export function getRulesForSpeciesAndState(species, state) {
  const normState = normalizeState(state);
  const normSpecies = normalizeSpecies(species);

  const base = {
    found: false,
    species: normSpecies || species,
    state: normState || state,
    closedFrom: null,
    closedTo: null,
    minSizeCm: null,
    notes: null,
  };

  if (!normState || !RULES[normState]) return base;
  const stateRules = RULES[normState];
  if (!normSpecies || !stateRules[normSpecies]) return base;

  return { ...base, ...stateRules[normSpecies], found: true, species: normSpecies, state: normState };
}

/**
 * Listet alle Fischarten mit Regeln für ein Bundesland.
 *
 * @param {string} state
 * @returns {string[]}
 */
export function getSpeciesListForState(state) {
  const normState = normalizeState(state);
  if (!normState || !RULES[normState]) return [];
  return Object.keys(RULES[normState]);
}

/**
 * Gibt alle unterstützten Bundesland-Codes zurück.
 *
 * @returns {string[]}
 */
export function getSupportedStates() {
  return Object.keys(RULES);
}
