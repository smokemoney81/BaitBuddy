// Begrüßungs-Generator des KI-Buddys.
//
// Bei jedem App-Start begrüßt der Buddy den Nutzer per Sprechblase (und TTS,
// falls aktiviert) — jedes Mal anders: Die Pools sind nach Tageszeit getrennt
// und mischen Stimmungen (humorvoll, motivierend, nachdenklich, neugierig).
// Optional fließt der Event-Status ein (aktives Event, Platzierung) und in
// einem Teil der Begrüßungen ein konkreter Funktions-Tipp der App.
//
// Anti-Wiederholung: Der zuletzt genutzte Index je Pool wird in localStorage
// gemerkt, damit zwei aufeinanderfolgende App-Starts nie dieselbe Begrüßung
// zeigen (Fallback auf In-Memory, falls localStorage nicht verfügbar ist).

const HISTORY_KEY = 'bb_buddy_greeting_history';

// Zeitstempel der letzten Begrüßung (localStorage). Ersetzt das frühere
// sessionStorage-Flag: Im Capacitor-WebView überlebt eine Sitzung das
// Wiederöffnen der App (Resume statt Neuladen), sodass ein reines Session-Flag
// nur EINMAL begrüßt hätte. Mit Zeitstempel + Cooldown begrüßt der Buddy bei
// jedem echten Wiederkommen erneut, ohne bei schnellem Weg-/Zurückwechseln zu
// spammen.
export const LAST_GREETING_KEY = 'bb_buddy_last_greeting';

// Nach so langer Foreground-Abwesenheit gilt ein Wiederkommen als „App erneut
// geöffnet" und der Buddy begrüßt erneut. 15 Minuten: kurzer Blick auf eine
// andere App löst keine neue Begrüßung aus, ein späteres Zurückkehren schon.
export const GREETING_COOLDOWN_MS = 15 * 60 * 1000;

const memoryHistory = {};

let memoryLastGreeting = 0;

function readLastGreeting() {
  try {
    const raw = localStorage.getItem(LAST_GREETING_KEY);
    const ts = raw ? Number(raw) : 0;
    return Number.isFinite(ts) ? ts : 0;
  } catch {
    return memoryLastGreeting;
  }
}

/**
 * Soll der Buddy jetzt (neu) begrüßen? True beim allerersten Mal und immer,
 * wenn die letzte Begrüßung länger als der Cooldown zurückliegt.
 * @param {number} [now]
 */
export function shouldGreet(now = Date.now()) {
  return now - readLastGreeting() > GREETING_COOLDOWN_MS;
}

/** Merkt sich den Zeitpunkt der aktuellen Begrüßung. */
export function markGreeted(now = Date.now()) {
  memoryLastGreeting = now;
  try {
    localStorage.setItem(LAST_GREETING_KEY, String(now));
  } catch {
    /* localStorage optional (Private Mode) — In-Memory reicht */
  }
}

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {};
  } catch {
    return { ...memoryHistory };
  }
}

function writeHistory(history) {
  Object.assign(memoryHistory, history);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* localStorage optional (Private Mode, SSR) — In-Memory reicht */
  }
}

// Wählt einen Eintrag aus dem Pool, der nicht dem zuletzt gewählten entspricht,
// und merkt sich die Wahl unter poolKey.
function pickVaried(poolKey, pool) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  if (pool.length === 1) return pool[0];
  const history = readHistory();
  const last = history[poolKey];
  let idx = Math.floor(Math.random() * pool.length);
  if (idx === last) idx = (idx + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length;
  history[poolKey] = idx;
  writeHistory(history);
  return pool[idx];
}

export function getTimeSlot(hour) {
  if (hour >= 5 && hour < 11) return 'morgen';
  if (hour >= 11 && hour < 17) return 'tag';
  if (hour >= 17 && hour < 22) return 'abend';
  return 'nacht';
}

// Stimmungsmix je Tageszeit: humorvoll, motivierend, nachdenklich, neugierig.
const GREETINGS = {
  morgen: [
    'Guten Morgen! Die frühen Angler fangen die dicksten Fische — und du bist ja schon wach.',
    'Morgenstund hat Fisch im Mund! Wie sieht dein Plan für heute aus?',
    'Na, schon einen Kaffee intus? Die Fische frühstücken jetzt auch gerade — beste Beißzeit.',
    'Guten Morgen! Ich hab die ganze Nacht über Köderführung nachgedacht. Frag mich was!',
    'Früh am Start! Morgens stehen die Räuber flach am Ufer — soll ich dir das Wetter dazu checken?',
    'Guten Morgen, Petri-Jünger! Was steht an: planen, angeln oder erstmal Fangbuch pflegen?',
    'Der Morgen gehört uns! Manche zählen Schafe, ich zähle nachts Schuppen. Was geht heute?',
    'Guten Morgen! Neuer Tag, neues Glück am Wasser. Sag Bescheid, wenn ich dir was abnehmen soll.',
  ],
  tag: [
    'Hey! Mittagszeit ist Planungszeit — die großen Fische machen jetzt eh Siesta. Was kann ich für dich tun?',
    'Moin! Ich hab gerade nichts an der Angel, also volle Aufmerksamkeit für dich.',
    'Hallo! Tagsüber ziehen sich die Räuber ins Tiefe zurück — gute Zeit, um Taktik zu besprechen.',
    'Na, wie läuft dein Tag? Meiner besteht zu hundert Prozent aus Angel-Gedanken. Praktisch für dich!',
    'Hey, schön dich zu sehen! Lass uns was vorbereiten, damit der nächste Ansitz sitzt.',
    'Hallo! Zwischen Frühstück und Abendbrot beißt es oft zäh — perfekter Moment für Fangbuch und Statistik.',
    'Tag zusammen! Wusstest du, dass Geduld die halbe Miete ist? Die andere Hälfte erklär ich dir gern.',
    'Hey! Ich bin aufgewärmt und voller Köder-Ideen. Womit starten wir?',
  ],
  abend: [
    'Guten Abend! Die Dämmerung ist Räuberzeit — Zander und Hecht drehen jetzt auf.',
    'Na, Feierabend? Für die Fische fängt die Schicht jetzt erst an. Für mich auch.',
    'Guten Abend! Perfekte Zeit für einen Ansitz — oder um den morgigen zu planen. Was darf es sein?',
    'Abendrot, Anglers Brot! Soll ich dir sagen, was heute Abend am besten laufen könnte?',
    'Hey! Der Abend ist die Stunde der Wahrheit am Wasser. Erzähl — geht es noch raus?',
    'Guten Abend! Ich hab den ganzen Tag Wissen gesammelt und platze gleich. Frag mich was!',
    'Schönen Abend! Wenn heute nichts mehr geht: Ein gepflegtes Fangbuch ist der halbe nächste Fang.',
    'Abend! Die besten Geschichten entstehen in der Dämmerung — und ich höre sie mir alle an.',
  ],
  nacht: [
    'Nachtschicht? Respekt! Aale, Zander und Welse sind jetzt auch unterwegs — du bist in guter Gesellschaft.',
    'Noch wach? Die echten Abenteuer passieren nachts am Wasser. Was führt dich her?',
    'Gute Nacht-Stunde! Leise sein, Kopflampe rot — und der Zander steht jetzt flach am Ufer.',
    'Nachts sind alle Fische grau — aber deine Chancen auf einen Großen sind es nicht. Was planst du?',
    'Oho, ein Nachtangler! Oder nur schlaflos? In beiden Fällen: Ich bin hellwach für dich.',
    'Mitternachtsschnack! Wusstest du, dass Welse bei Nacht am Ufer rauben? Erzähl, was dich umtreibt.',
    'Noch unterwegs? Perfekt — nachts kann man in Ruhe Taktik schmieden, ganz ohne Ablenkung.',
    'Psst, nicht die Fische wecken! Was kann ich dir zu so später Stunde Gutes tun?',
  ],
};

// Event-Zeilen: Platzierung motivierend kommentieren bzw. zur Teilnahme animieren.
function buildEventLine(event, rank) {
  if (!event?.name) return null;
  const days = Number.isFinite(event.days_left) ? event.days_left : null;
  const daysText = days != null ? (days <= 1 ? 'nur noch heute' : `noch ${days} Tage`) : null;

  if (rank === 1) {
    return pickVaried('event_rank1', [
      `Und übrigens: Du führst gerade das Event „${event.name}" an — Titelverteidigung läuft!`,
      `Platz 1 im Event „${event.name}" — die anderen jagen dich. Lass sie nicht rankommen!`,
    ]);
  }
  if (rank != null && rank <= 3) {
    return pickVaried('event_top3', [
      `Stark: Platz ${rank} im Event „${event.name}"! Das Podium hast du sicher — jetzt zählt jeder Fang Richtung Spitze.`,
      `Du liegst auf Platz ${rank} bei „${event.name}" — ein guter Fang und du greifst nach der Krone!`,
    ]);
  }
  if (rank != null) {
    return pickVaried('event_ranked', [
      `Im Event „${event.name}" stehst du auf Platz ${rank}${daysText ? ` — ${daysText} Zeit zum Klettern` : ''}!`,
      `Platz ${rank} bei „${event.name}" — da ist noch Luft nach oben. Ich helfe dir beim Aufholen!`,
    ]);
  }
  return pickVaried('event_join', [
    `Übrigens läuft gerade das Event „${event.name}"${daysText ? ` (${daysText})` : ''} — Lust mitzumischen?`,
    `Das Event „${event.name}" ist live${daysText ? `, ${daysText}` : ''}. Dein nächster Fang könnte direkt Punkte bringen!`,
  ]);
}

// Konkrete Funktions-Tipps — echte App-Features mit Ansage-Beispielen.
export const FEATURE_TIPS = [
  'Tipp: Sag einfach „Trag einen Karpfen in mein Fangbuch ein" — ich lege den Eintrag an, und Länge, Gewicht oder Foto kannst du später ergänzen.',
  'Tipp: Mach ein Foto von deinem Fang — die KI-Erkennung im Fangbuch bestimmt die Art und schätzt Länge und Gewicht automatisch.',
  'Tipp: Sag mir „Speichere diesen Spot als See" und ich lege den Angelplatz direkt auf deiner Karte an.',
  'Tipp: Frag mich „Wie stehen die Angel-Chancen heute?" — ich kombiniere Wetter und deine Fanghistorie zu einer Empfehlung.',
  'Tipp: Sag „Öffne die Karte" oder „Zeig mein Fangbuch" — ich navigiere dich durch die ganze App.',
  'Tipp: Frag mich nach einem Fangbericht — ich fasse deine Fänge der letzten Wochen als Bericht zusammen.',
  'Tipp: Unsicher beim Knoten? Frag mich z. B. nach dem Palomar — ich erkläre ihn dir Schritt für Schritt.',
  'Tipp: Im Quiz kannst du für die Angelschein-Prüfung üben — frag mich vorher ruhig Prüfungsfragen ab.',
  'Tipp: Frag mich „Welcher Köder passt heute?" — ich beziehe Wetter, Jahreszeit und deine Erfolge mit ein.',
  'Tipp: In der Wasseranalyse siehst du pH, Temperatur und Trübung — und ich sage dir, wie du dabei fischst.',
];

/**
 * Baut die Begrüßung fürs App-Öffnen zusammen.
 * @param {object} opts
 * @param {number} [opts.hour] Stunde 0–23 (Default: jetzt)
 * @param {object|null} [opts.event] aktives Event ({ name, days_left }) oder null
 * @param {number|null} [opts.rank] Platzierung des Nutzers im Event (1-basiert) oder null
 * @param {boolean} [opts.withTip] Funktions-Tipp erzwingen/unterdrücken (Default: zufällig ~40%)
 * @returns {string}
 */
export function buildGreeting({ hour = new Date().getHours(), event = null, rank = null, withTip } = {}) {
  const slot = getTimeSlot(hour);
  const parts = [pickVaried(`greet_${slot}`, GREETINGS[slot])];

  const eventLine = buildEventLine(event, rank);
  if (eventLine) parts.push(eventLine);

  // Ohne Event-Zeile häufiger einen Funktions-Tipp zeigen, damit die Blase
  // informativ bleibt, aber nicht jedes Mal überläuft.
  const includeTip = withTip ?? Math.random() < (eventLine ? 0.25 : 0.4);
  if (includeTip) parts.push(pickVaried('feature_tip', FEATURE_TIPS));

  return parts.join(' ');
}

// Kurze, persönliche Begrüßung für die Startseite (Dashboard-Vorlage:
// „Hey Basti! Schön, dass du da bist. Wie war dein Tag?"). Bewusst kürzer als
// buildGreeting, weil die Blase neben der Wetterspalte wenig Platz hat.
const HOME_GREETINGS = {
  morgen: [
    'Schön, dass du da bist. Was hast du heute vor?',
    'Guten Morgen! Schon einen Plan fürs Wasser?',
    'Schön, dich zu sehen. Wie ist der Morgen bei dir?',
  ],
  tag: [
    'Schön, dass du da bist. Wie läuft dein Tag?',
    'Schön, dich zu sehen. Was kann ich für dich tun?',
    'Na, wie sieht es aus? Lust auf einen Ansitz?',
  ],
  abend: [
    'Schön, dass du da bist. Wie war dein Tag?',
    'Schön, dich zu sehen. Lust auf einen Abendansitz?',
    'Feierabend? Dann lass uns übers Angeln reden.',
  ],
  nacht: [
    'Schön, dass du da bist. Noch wach und am Planen?',
    'Nachtschicht? Frag mich ruhig, ich bin da.',
    'Schön, dich zu sehen. Was geht dir durch den Kopf?',
  ],
};

/** Vorname für die Anrede: Anzeigename vor dem ersten Wort des vollen Namens. */
export function greetingName(user) {
  const nickname = typeof user?.nickname === 'string' ? user.nickname.trim() : '';
  if (nickname) return nickname;
  const full = typeof user?.full_name === 'string' ? user.full_name.trim() : '';
  return full ? full.split(/\s+/)[0] : '';
}

/** Wählt die Begrüßungszeile passend zur Tageszeit (mit Anti-Wiederholung). */
export function pickHomeGreetingLine(hour = new Date().getHours()) {
  return pickVaried(`home_${getTimeSlot(hour)}`, HOME_GREETINGS[getTimeSlot(hour)]);
}

/** „Hey Basti! <Zeile>" bzw. „Hey! <Zeile>" ohne bekannten Namen. */
export function formatHomeGreeting(name, line) {
  const cleanName = String(name || '').trim();
  return `${cleanName ? `Hey ${cleanName}!` : 'Hey!'} ${line}`;
}

// Die Startseiten-Begrüßung bleibt stehen, solange der Nutzer die Startseite
// innerhalb des Cooldowns wieder aufruft (z. B. Frage stellen → Antwort lesen
// → zurück): Dann passt ihre Uhrzeit vor die folgende Frage, wie in der
// Vorlage. Wer länger weg war, bekommt eine neue Begrüßung.
export const HOME_GREETING_KEY = 'bb_home_greeting';

/**
 * @param {number} [now]
 * @returns {{ line: string, at: number }}
 */
export function currentHomeGreeting(now = Date.now()) {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(HOME_GREETING_KEY) || 'null');
  } catch {
    stored = null;
  }
  const fresh = stored && typeof stored.line === 'string' && Number.isFinite(stored.at)
    && Number.isFinite(stored.seenAt) && now - stored.seenAt <= GREETING_COOLDOWN_MS && stored.at <= now;
  const greeting = fresh
    ? { line: stored.line, at: stored.at }
    : { line: pickHomeGreetingLine(new Date(now).getHours()), at: now };
  try {
    localStorage.setItem(HOME_GREETING_KEY, JSON.stringify({ ...greeting, seenAt: now }));
  } catch {
    /* localStorage optional — dann gilt die Begrüßung nur für diesen Aufruf */
  }
  return greeting;
}

/**
 * Begrüßung für die Startseite, z. B. „Hey Basti! Schön, dass du da bist. Wie war dein Tag?"
 * @param {object} opts
 * @param {string} [opts.name] Anrede (leer → „Hey!")
 * @param {number} [opts.hour] Stunde 0–23 (Default: jetzt)
 */
export function buildHomeGreeting({ name = '', hour = new Date().getHours() } = {}) {
  return formatHomeGreeting(name, pickHomeGreetingLine(hour));
}

// Abwechslungsreiche, stimmungsvolle Rückfragen für die Seiten-Blase — damit
// der Buddy nicht auf jeder Seite immer denselben festen Satz zeigt.
const VARIED_QUESTIONS = [
  'Sag mal, wie war dein letzter Ansitz — lief was zusammen?',
  'Was hast du heute vor am Wasser?',
  'Neugierig: Welcher Köder ist gerade dein Geheimtipp?',
  'Erzähl — hast du schon einen Lieblingsspot für diese Jahreszeit?',
  'Hast du heute ein gutes Gefühl? Manchmal reicht das ja schon.',
  'Woran arbeitest du gerade — Technik, neuer Spot oder einfach entspannen?',
  'Wenn du eine Sache über deinen letzten Fang wüsstest — was wäre es?',
];

/**
 * Liefert den Text für die Seiten-Blase (nach dem Start, wenn nicht begrüßt
 * wird). Rotiert bewusst zwischen der seitenspezifischen Frage, einer
 * variierenden Buddy-Frage und einem Funktions-Tipp, damit sich die Blase nicht
 * eintönig anfühlt.
 * @param {string} pageQuestion seitenspezifische Frage (getQuestionForPage)
 * @param {number} [roll] 0..1, testbar; Default zufällig
 */
export function getVariedPageBubble(pageQuestion, roll = Math.random()) {
  if (roll < 0.5 && pageQuestion) return pageQuestion;
  if (roll < 0.8) return pickVaried('varied_question', VARIED_QUESTIONS);
  return pickVaried('feature_tip', FEATURE_TIPS);
}
