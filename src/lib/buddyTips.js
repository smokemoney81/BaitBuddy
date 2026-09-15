// Seiten-spezifische KI-Buddy Tipps
// Format: pageName -> { title, message, question, suggestions }
// - question: kurze, seitenspezifische Frage, mit der sich der KI-Buddy in der kleinen
//   Sprechblase meldet, sobald eine Seite zum ersten Mal geöffnet wird.

export const BUDDY_TIPS = {
  Dashboard: {
    title: 'Willkommen zurück!',
    message: 'Ich kann dir helfen, deine beste Fangzeit zu finden und neue Spots zu entdecken.',
    question: 'Soll ich dir deine beste Fangzeit für heute anzeigen?',
    suggestions: ['Analyse meiner Fänge', 'Wetter für Heute', 'Beste Fangzeit'],
  },
  Home: {
    title: 'Willkommen bei BaitBuddy!',
    message: 'Ich bin dein persönlicher Angel-Assistent. Lass mich dir helfen, bessere Fänge zu machen!',
    question: 'Möchtest du wissen, wie du mit BaitBuddy startest?',
    suggestions: ['Erste Schritte', 'Tipps zum Angeln', 'Meine Fangausrüstung'],
  },
  Weather: {
    title: 'Wetter & Bedingungen',
    message: 'Ich kann dir sagen, wie die Bedingungen für deine Zielart sind und wann es optimal wird.',
    question: 'Soll ich dir sagen, ob das Wetter heute zum Angeln passt?',
    suggestions: ['Beste Fangzeit heute', 'Wetter-Vorhersage', 'Wie fische ich bei Regen?'],
  },
  Map: {
    title: 'Angelplätze',
    message: 'Markiere hier deine liebsten Spots und ich lerne, wo du erfolgreich bist!',
    question: 'Möchtest du hier einen neuen Angel-Spot eintragen?',
    suggestions: ['Neuen Spot eintragen', 'Spots analysieren', 'Ähnliche Plätze finden'],
  },
  Logbook: {
    title: 'Fangbuch',
    message: 'Erzähl mir von deinen Fängen – ich kann deine Erfolgsquote und Muster analysieren.',
    question: 'Soll ich deinen letzten Fang eintragen oder deine Statistiken zeigen?',
    suggestions: ['Fang eintragen', 'Meine Statistiken', 'Erfolgreichste Köder'],
  },
  Log: {
    title: 'Fangbuch',
    message: 'Erzähl mir von deinen Fängen – ich kann deine Erfolgsquote und Muster analysieren.',
    question: 'Soll ich deinen letzten Fang eintragen oder deine Statistiken zeigen?',
    suggestions: ['Fang eintragen', 'Meine Statistiken', 'Erfolgreichste Köder'],
  },
  BaitMixer: {
    title: 'Köder-Mixer',
    message: 'Brauchst du ein neues Köder-Rezept? Ich kann dir basierend auf deinen Erfolgen eine Mischung empfehlen!',
    question: 'Brauchst du ein passendes Köder-Rezept für heute?',
    suggestions: ['Köder-Rezept', 'Meine erfolgreichsten Köder', 'Was lockt diese Art an?'],
  },
  BaitMixerPro: {
    title: 'Köder-Mixer PRO',
    message: 'Mit erweiterten Analysen kann ich dir die perfekte Köder-Zusammensetzung vorschlagen.',
    question: 'Soll ich dir die perfekte Köder-Zusammensetzung berechnen?',
    suggestions: ['Köder analysieren', 'Neue Rezeptur', 'Nährstoff-Berechnung'],
  },
  WaterAnalysis: {
    title: 'Wasseranalyse',
    message: 'Die Wasser-Bedingungen sind entscheidend! Lass mich helfen, optimale Parameter zu verstehen.',
    question: 'Möchtest du wissen, wie du bei diesen Wasser-Werten am besten fischst?',
    suggestions: ['Wie fische ich bei pH 7?', 'Temperatur-Tipps', 'Trübung ausnützen'],
  },
  TripPlanner: {
    title: 'Trip-Planner',
    message: 'Lass mich deinen nächsten Angelurlaub planen – mit den besten Spots und Bedingungen!',
    question: 'Soll ich deinen nächsten Angel-Trip planen?',
    suggestions: ['Trip planen', 'Best Spots in der Region', 'Ausrüstung packen'],
  },
  AnglerMode: {
    title: 'Anglermodus',
    message: 'Du bist am Wasser — ich halte dir den Rücken frei. Sag mir, was beißt, oder frag nach dem besten Zeitfenster.',
    question: 'Läuft was? Ich kann dir das aktuelle Bissfenster oder einen Köderwechsel vorschlagen.',
    suggestions: ['Aktuelles Bissfenster', 'Köder wechseln?', 'Fang eintragen'],
  },
  ARKnotenAssistent: {
    title: 'AR-Knoten-Assistent',
    message: 'Ich kann dir jeden Knoten Schritt-für-Schritt zeigen – mit AR-Unterstützung!',
    question: 'Welchen Knoten möchtest du lernen?',
    suggestions: ['Knoten lernen', 'Palomar-Knoten', 'Welcher Knoten passt?'],
  },
  Community: {
    title: 'Community',
    message: 'Vergleiche deine Erfolge mit anderen Anglern und teile deine besten Tipps!',
    question: 'Möchtest du sehen, wie du im Vergleich zu anderen Anglern stehst?',
    suggestions: ['Top Angler dieser Woche', 'Fänge vergleichen', 'Tipps teilen'],
  },
  Events: {
    title: 'Events & Wettbewerbe',
    message: 'Hier treffen sich andere Angler! Schau mal, ob es bald einen spannenden Wettbewerb oder Community-Event in deiner Nähe gibt – könnte genau der richtige Moment sein, um deine Fänge zu zeigen!',
    question: 'Soll ich dir Events und Wettbewerbe in deiner Nähe zeigen?',
    suggestions: ['Events in meiner Nähe', 'Event anmelden', 'Leaderboard', 'Beste Angler ansehen'],
  },
  Premium: {
    title: 'Premium Features',
    message: 'Mit Premium-Analysen kann ich dir noch bessere, detailliertere Vorhersagen geben!',
    question: 'Möchtest du wissen, was dir Premium bringt?',
    suggestions: ['Was ist Premium?', 'Premium-Features', 'Upgrade-Vorteile'],
  },
  Shop: {
    title: 'Shop',
    message: 'Findest du die richtige Ausrüstung? Lass mich dir empfohlene Produkte zeigen!',
    question: 'Suchst du bestimmte Ausrüstung? Ich helfe dir bei der Auswahl.',
    suggestions: ['Ruten für Anfänger', 'Köder kaufen', 'Komplette Ausrüstung'],
  },
  Profile: {
    title: 'Profil',
    message: 'Hier kannst du dein Profil verwalten – deine Angel-Karriere in einer Übersicht!',
    question: 'Möchtest du deine Angel-Statistiken im Überblick sehen?',
    suggestions: ['Meine Statistiken', 'Erfolgsgeschichte', 'Abzeichen ansehen'],
  },
  Settings: {
    title: 'Einstellungen',
    message: 'Personalisiere dein BaitBuddy-Erlebnis nach deinen Vorlieben!',
    question: 'Möchtest du Benachrichtigungen oder Sprache anpassen?',
    suggestions: ['Benachrichtigungen', 'Sprache ändern', 'Datenschutz'],
  },
  Analysis: {
    title: 'Analyse',
    message: 'Tiefe Analysen deiner Erfolge – ich finde die Muster und zeige dir, was funktioniert!',
    question: 'Soll ich die Muster in deinen Fängen für dich analysieren?',
    suggestions: ['Beste Fangzeit', 'Erfolgsquote nach Köder', 'Saisonale Trends'],
  },
  CatchStats: {
    title: 'Fang-Statistiken',
    message: 'Deine Erfolgsbilanz im Detail – Arten, Größen, Gewichte und mehr!',
    question: 'Möchtest du deine größten Fänge und häufigsten Arten sehen?',
    suggestions: ['Größte Fänge', 'Häufigste Arten', 'Diesen Monat vs. letzten'],
  },
  KiBuddyBeta: {
    title: 'KI-Buddy Chat',
    message: 'Du bist bereits hier – wir können sofort starten! Frag mich, was du wissen möchtest.',
    question: 'Wir sind startklar – was möchtest du mich fragen?',
    suggestions: ['Schnelle Frage', 'Live-Sprechen', 'Tutorial starten'],
  },
  // Ersetzt den frueheren AIAssistant-Eintrag: eine Seite dieses Namens gibt es
  // nicht, der Tipp war also nie erreichbar. Der Live-Sprachchat laeuft ueber
  // die VoiceChat-Seite.
  VoiceChat: {
    title: 'Live-Sprachchat',
    message: 'Sprich direkt mit mir – wie am Telefon, ohne Tippen.',
    question: 'Sollen wir loslegen? Tippe auf Anrufen und leg einfach los.',
    suggestions: ['Gespräch starten', 'Köder-Tipp erfragen', 'Zurück zum Chat'],
  },
  Tutorials: {
    title: 'Tutorials',
    message: 'Lerne Schritt für Schritt von Anfänger bis Profi-Techniken!',
    question: 'Womit möchtest du starten – Anfänger oder Fortgeschrittene?',
    suggestions: ['Anfänger-Guide', 'Fortgeschrittene Techniken', 'Video-Tutorials'],
  },
  Fishing: {
    title: 'Angeln',
    message: 'Alle deine Angeltechniken, Fangmethoden und Tipps auf einen Blick!',
    question: 'Soll ich dir die passende Technik für deine Zielart zeigen?',
    suggestions: ['Welche Technik passt?', 'Für diese Art', 'Wassertyp-Guide'],
  },
  Gear: {
    title: 'Ausrüstung',
    message: 'Verwalte deine Ruten, Rollen, Schnüre – und ich helfe dir, die richtige zu wählen!',
    question: 'Möchtest du Hilfe bei der Wahl der richtigen Ausrüstung?',
    suggestions: ['Neue Rute kaufen?', 'Meine Ausrüstung', 'Pflege-Tipps'],
  },
  Water: {
    title: 'Gewässer',
    message: 'Entdecke neue Gewässer in deiner Nähe – mit Infos zu Arten, Gesetzen und Bedingungen!',
    question: 'Soll ich dir Gewässer in deiner Nähe zeigen?',
    suggestions: ['Gewässer in meiner Nähe', 'Beste für meine Art', 'Regeln & Gesetze'],
  },
  User: {
    title: 'Benutzer',
    message: 'Dein Angel-Profil und Erfolgsgeschichte – deine persönliche Legende!',
    question: 'Möchtest du deine Bestleistungen und Meilensteine sehen?',
    suggestions: ['Meine Bestleistungen', 'Meilensteine', 'Erfolgsgeschichte'],
  },
  CatchCam: {
    title: 'Fang-Kamera',
    message: 'Dokumentiere deine Fänge mit Fotos – ich erkenne automatisch die Art und Größe!',
    question: 'Möchtest du deinen Fang fotografieren und automatisch bestimmen lassen?',
    suggestions: ['Foto machen', 'Fang identifizieren', 'Galerie ansehen'],
  },
  Match3Game: {
    title: 'Fang-Match',
    message: 'Löse Rätsel und gewinne Punkte – und lerne dabei über Fischarten!',
    question: 'Lust auf eine Runde Fang-Match?',
    suggestions: ['Neues Spiel', 'Meine Bestleistung', 'Regeln verstehen'],
  },
  Rank: {
    title: 'Rangliste',
    message: 'Vergleiche deine Erfolge mit anderen – wer ist der beste Angler?',
    question: 'Möchtest du sehen, auf welchem Rang du stehst?',
    suggestions: ['Mein Rang', 'Top 10 Angler', 'Meinen Score steigern'],
  },
  VoiceControl: {
    title: 'Sprach-Steuerung',
    message: 'Kontrolliere dein BaitBuddy vollständig mit Sprachkommandos!',
    question: 'Soll ich dir die wichtigsten Sprachkommandos zeigen?',
    suggestions: ['Sprachkommandos lernen', 'Demo starten', 'Einstellungen'],
  },
  StartFishing: {
    title: 'Angeln starten',
    message: 'Bereite dich auf deinen nächsten Angelausflug vor – Ausrüstung, Wetter, Tipps!',
    question: 'Soll ich dich auf deinen nächsten Ausflug vorbereiten?',
    suggestions: ['Meine Ausrüstung', 'Wetter prüfen', 'Spot auswählen'],
  },
  VoiceLecture: {
    title: 'Audio-Anleitung',
    message: 'Höre dir Expert-Tipps an – perfekt für die Fahrt zum Gewässer!',
    question: 'Möchtest du eine Audio-Lektion starten?',
    suggestions: ['Neue Lektion', 'Beliebte Themen', 'Fortschritt'],
  },
  DeviceIntegration: {
    title: 'Geräte-Integration',
    message: 'Verbinde deine Smartwatch, GPS-Geräte und Sensoren mit BaitBuddy!',
    question: 'Möchtest du ein neues Gerät verbinden?',
    suggestions: ['Gerät hinzufügen', 'Verfügbare Geräte', 'Kopplung hilfe'],
  },
  Help: {
    title: 'Hilfe & Unterstützung',
    message: 'Ich helfe dir mit Fragen zu BaitBuddy, Angeln oder technischen Problemen!',
    question: 'Womit kann ich dir helfen?',
    suggestions: ['Häufig gestellt', 'Tutorial starten', 'Kontakt zum Support'],
  },
  Datenschutz: {
    title: 'Datenschutz',
    message: 'Deine Privatsphäre ist mir wichtig – alle Infos zu deinen Daten!',
    question: 'Möchtest du wissen, welche Daten gespeichert werden?',
    suggestions: ['Was wird gespeichert?', 'Daten löschen', 'Einwilligung'],
  },
  Impressum: {
    title: 'Impressum',
    message: 'Rechtliche Infos zu BaitBuddy – Kontakt und Verantwortliche!',
    question: 'Suchst du Kontakt- oder Unternehmensinfos?',
    suggestions: ['Kontakt', 'Unternehmen', 'Disclaimer'],
  },
};

// Fallback wenn keine Seite gelistet ist
export const DEFAULT_TIP = {
  title: 'Wie kann ich dir helfen?',
  message: 'Ich bin hier, um dich bei deinem Angel-Abenteuer zu unterstützen. Hast du eine Frage zu dieser Seite oder zum Angeln allgemein?',
  question: 'Soll ich dir erklären, was du auf dieser Seite machen kannst?',
  suggestions: ['Diese Seite erklären', 'Schnelle Frage', 'Live sprechen', 'Tutorial starten'],
};

/**
 * Leite den Seitennamen aus dem Router-Pathname ab (erstes Pfadsegment).
 * Die Startseite "/" rendert laut pages.config die Home-Seite, deshalb
 * fällt der leere Pfad auf "Home" zurück.
 * @param {string} pathname - location.pathname (z.B. "/Weather", "/events/123")
 * @returns {string} Seitenname passend zu den BUDDY_TIPS-Keys
 */
export function getPageNameFromPathname(pathname) {
  const first = (pathname || '').replace(/^\//, '').split('/')[0];
  return first || 'Home';
}

/**
 * Hole den Tip für eine Seite basierend auf pageName
 * @param {string} pageName - Name der Seite (z.B. "Dashboard", "Weather")
 * @returns {object} Tip-Objekt mit title, message, question, suggestions
 */
export function getTipForPage(pageName) {
  // Entferne führende "/" wenn vorhanden
  const cleanName = pageName.replace(/^\//, '');

  return BUDDY_TIPS[cleanName] || DEFAULT_TIP;
}

/**
 * Hole die seitenspezifische Frage, mit der sich der KI-Buddy beim ersten Öffnen einer
 * Seite in der kleinen Sprechblase meldet.
 * @param {string} pageName - Name der Seite (z.B. "Dashboard", "Weather")
 * @returns {string} Seitenspezifische Frage
 */
export function getQuestionForPage(pageName) {
  const tip = getTipForPage(pageName);
  return tip.question || DEFAULT_TIP.question;
}
