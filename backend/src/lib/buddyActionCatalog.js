// Aktions-Katalog des KI-Buddys (BaitBuddy 2.0, §7).
//
// EINE Quelle für die Aktionen, die der Buddy auslösen darf. Aus ihr entsteht
// der Aktions-Abschnitt des System-Prompts; ausgeführt werden sie clientseitig
// von `src/utils/buddyActions.js`.
//
// Anlass: Beide Seiten waren auseinandergelaufen. Der Client führte bereits
// `create_trip`, `post_community`, `support_ticket` und `open_url` aus, der
// Prompt nannte aber nur `navigate`, `log_catch` und `add_spot` — vier
// Fähigkeiten waren implementiert, wurden dem Modell aber nie mitgeteilt und
// konnten deshalb nie ausgelöst werden. `buddyActionCatalog.sync.test.js` hält
// beide Seiten ab jetzt zusammen.

// Erlaubte Werte für `navigate.page`. Aufgelöst wird clientseitig über
// `resolvePage` (src/lib/voicePages.js); ein unbekannter Wert führt zu keiner
// Navigation, nicht zu einem Fehler.
export const NAVIGATE_PAGES = [
  'dashboard', 'logbuch', 'karte', 'wetter', 'warnung', 'community',
  'ausruestung', 'chat', 'ki', 'trip', 'profil', 'einstellungen', 'rang',
  'wasser', 'angelschein', 'quiz', 'lizenzen', 'events', 'koeder', 'statistik',
  'knoten', 'shop', 'premium', 'hilfe', 'tutorial', 'geraete', 'voice',
  'personalisierung',
];

/**
 * @typedef {object} BuddyAction
 * @property {string} type      Aktions-Kennung, exakt wie im Client-Handler
 * @property {string} summary   Wofür der Buddy sie nutzt
 * @property {string} example   Beispiel-JSON für den Prompt
 * @property {string} [note]    Zusätzliche Regel für das Modell
 */

/** @type {BuddyAction[]} */
export const BUDDY_ACTIONS = [
  {
    type: 'navigate',
    summary: 'Navigieren / Seite öffnen',
    example: '{"type":"navigate","params":{"page":"<seite>"}}',
    note: `Erlaubte Seiten-Werte: ${NAVIGATE_PAGES.join(', ')}`,
  },
  {
    type: 'log_catch',
    summary: 'Fang ins Fangbuch eintragen',
    example: '{"type":"log_catch","params":{"species":"Hecht","length_cm":75,"weight_kg":4.2,"bait_used":"Gummifisch","notes":"..."}}',
    note: 'Ohne "species" kann der Fang nicht eingetragen werden — frag dann nach der Fischart.',
  },
  {
    type: 'add_spot',
    summary: 'Spot speichern',
    example: '{"type":"add_spot","params":{"name":"Mein Spot","water_type":"see|fluss|teich|kanal|bach","notes":"..."}}',
    note: 'Ohne "name" frag nach, wie der Spot heißen soll.',
  },
  {
    type: 'create_trip',
    summary: 'Tour im Trip-Planer anlegen',
    example: '{"type":"create_trip","params":{"title":"Zandertour Rhein","target_fish":"Zander","spot_info":"Buhne 12","weather_summary":"...","gear_summary":"...","steps":["..."],"is_active":false}}',
    note: 'Titel und Zielfisch sind Pflicht. Nutze sie, wenn jemand einen Ausflug geplant haben möchte.',
  },
  {
    type: 'post_community',
    summary: 'Beitrag in der Community posten',
    example: '{"type":"post_community","params":{"text":"..."}}',
    note: 'Nur auf ausdrücklichen Wunsch — der Beitrag ist für andere sichtbar. Lies den Text vorher vor.',
  },
  {
    type: 'support_ticket',
    summary: 'Support-Ticket erstellen',
    example: '{"type":"support_ticket","params":{"subject":"...","message":"...","category":"frage|problem|idee"}}',
    note: 'Betreff und Beschreibung sind Pflicht. Nutze es bei echten Problemen mit der App, nicht bei Angelfragen.',
  },
  {
    type: 'open_url',
    summary: 'Externen Link öffnen',
    example: '{"type":"open_url","params":{"url":"https://..."}}',
    note: 'Nur http(s)-Adressen, und nur wenn der Nutzer den Link ausdrücklich öffnen will.',
  },
];

// Der Client akzeptiert `save_spot` als Synonym zu `add_spot`. Der Prompt nennt
// bewusst nur eine Schreibweise; das Synonym existiert für ältere Antworten.
export const ACTION_ALIASES = { save_spot: 'add_spot' };

export const ACTION_TYPES = BUDDY_ACTIONS.map((a) => a.type);

/** Baut den Aktions-Abschnitt des System-Prompts aus dem Katalog. */
export function buildActionPromptSection() {
  const list = BUDDY_ACTIONS.map((action, index) => {
    const lines = [`${index + 1}. ${action.summary}: ${action.example}`];
    if (action.note) lines.push(`   ${action.note}`);
    return lines.join('\n');
  }).join('\n');

  return `DU KANNST DIE APP STEUERN. Wenn der Nutzer dich darum bittet, etwas in der App zu tun, hänge ans ENDE deiner Antwort einen Aktions-Block an. Format exakt so (nur EIN Block pro Antwort):
<<ACTION>>{"type":"...","params":{...}}<<END>>

Verfügbare Aktionen:
${list}

Regeln: Aktions-Block nur wenn Nutzer wirklich eine Aktion will. Zuerst kurze Bestätigung, dann Block. Block wird dem Nutzer nicht angezeigt. Nutze fuer "page" exakt einen der erlaubten Werte. Fehlt dir eine Pflichtangabe, frag nach, statt sie zu erfinden.`;
}
