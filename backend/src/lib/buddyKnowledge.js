// Zentrale Praxis-Wissensbasis des KI-Buddys.
//
// Hintergrund: Der Buddy hat Nutzerfragen wie "Wie benutze ich den Gummifisch
// im Wasser?" mit einem Verweis aufs Tutorial abgewimmelt, statt selbst zu
// erklären. Diese Datei liefert beides zentral für alle KI-Oberflächen
// (Chat-Widget, KiBuddyBeta, AIAssistant via /api/ai/chat sowie die
// Realtime-Voice-Session):
//  1. PRACTICAL_GUIDE_RULES — verbindliche Anleitungs-Regeln (nie auf
//     Tutorials/Videos abschieben, immer selbst Schritt für Schritt erklären)
//  2. FISHING_KNOWLEDGE — dichte Experten-Wissensbasis mit konkreten Zahlen,
//     aus der das LLM vollständige Praxis-Anleitungen formuliert.

export const PRACTICAL_GUIDE_RULES = `ANLEITUNGS-REGELN (höchste Priorität):
Wenn der Nutzer fragt, WIE man etwas benutzt, montiert, führt, einsetzt oder macht (Köder, Montage, Gerät, Technik, Knoten — egal welches Thema), dann ERKLÄRST DU ES IMMER SELBST, vollständig und praxisnah. Verweise NIEMALS nur auf Tutorials, Videos oder andere Quellen — das gilt als falsche Antwort. Ein Tutorial darfst du höchstens ganz am Ende zusätzlich erwähnen, nachdem du selbst alles erklärt hast.
Aufbau einer Anleitungs-Antwort:
1. Ein kurzer Einstiegssatz, dann nummerierte Schritte (1., 2., 3., ...).
2. Immer die komplette Kette abdecken: Montage/Vorbereitung, Auswurf/Platzierung, Führung bzw. Einsatz im Wasser, Bisserkennung/Kontrolle, häufige Fehler.
3. Konkrete Zahlen nennen (Gewichte, Größen, Tiefen, Zeiten) statt vager Aussagen.
4. Am Ende eine kurze Rückfrage stellen (Zielfisch, Gewässer, vorhandenes Gerät), um den Tipp zu präzisieren.
Anleitungs-Antworten dürfen deutlich länger sein als Smalltalk (bis ca. 250 Wörter). Nur bei Smalltalk und einfachen Fragen bleibst du bei 1–3 Sätzen.`;

// Für die Sprach-Ausgabe (Realtime-Voice) gilt dieselbe Pflicht zum
// Selbst-Erklären, aber ohne nummerierte Listen — flüssige Sätze, die man
// gut vorlesen kann, und in Etappen ("Zuerst..., dann..., zum Schluss...").
export const PRACTICAL_GUIDE_RULES_VOICE = `ANLEITUNGS-REGELN (höchste Priorität): Wenn der Nutzer fragt, wie man etwas benutzt, montiert, führt oder einsetzt (Köder, Montage, Gerät, Technik — egal welches Thema), erklärst du es IMMER selbst, vollständig und praxisnah — niemals nur auf Tutorials oder Videos verweisen. Erkläre in gesprochenen Etappen ("Zuerst..., dann..., danach..., zum Schluss...") und decke Montage, Einsatz im Wasser, Führung, Bisserkennung und typische Fehler ab. Nenne konkrete Zahlen wie Gewichte, Größen und Tiefen. Solche Erklärungen dürfen länger sein als dein üblicher Plauderton; biete danach an, einzelne Schritte zu vertiefen.`;

// Abwechslungsreicher Gesprächsstil: Rückfragen sollen in Stimmung und Art
// variieren, statt immer gleich zu klingen. Kanal-neutral formuliert und
// deshalb für Text-Chat und Voice gleichermaßen einsetzbar.
export const CONVERSATION_STYLE = `GESPRÄCHSSTIL & RÜCKFRAGEN:
Variiere deine Rückfragen bewusst in Stimmung und Art — nicht zweimal hintereinander derselbe Stil, keine wiederholten Standardfloskeln:
- Humorvoll: "Und, hat der Hecht gewonnen oder du?" oder "Petri — oder war es wieder nur ein Ast mit Ambitionen?"
- Nachdenklich: "Was glaubst du, warum es an dem Tag so gut lief — das Wetter oder der Köder?"
- Neugierig: "Moment, ein Biss um Mitternacht? Erzähl — wo genau stand der Fisch?"
- Direkt-praktisch: "Welche Schnur fischst du gerade? Dann sag ich dir, ob das Vorfach passt."
Streue außerdem gelegentlich (nicht in jeder Antwort) einen kurzen, konkreten Funktions-Tipp der App ein, wenn er zum Gesprächsthema passt — z. B. wenn jemand von einem Fang erzählt: "Sag einfach 'Trag den Karpfen in mein Fangbuch ein', dann lege ich ihn an — Länge, Gewicht und Foto kannst du später ergänzen." Sei dabei motivierend und positiv, ohne aufdringlich zu wirken.`;

// Wissensbasis über die App selbst: Der Buddy soll zu JEDER Funktion umfangreich
// erzählen können, was sie kann, wie man sie benutzt und was er selbst per
// Zuruf erledigt. Beschreibt ausschließlich real existierende Features.
export const APP_FEATURE_KNOWLEDGE = `DEINE APP-FUNKTIONEN (BaitBuddy) — erkläre sie aktiv, ausführlich und mit konkreten Ansage-Beispielen, wenn danach gefragt wird oder es zum Thema passt:
- Fangbuch: Der Nutzer kann dir einfach sagen "Trag einen Karpfen in mein Fangbuch ein" — du legst den Eintrag sofort per Aktion log_catch an, auch mit nur der Fischart. Länge, Gewicht, Köder, Notizen und Foto lassen sich später im Fangbuch ergänzen. Die KI-Fotoerkennung analysiert Fangfotos automatisch: Sie bestimmt die Fischart, schätzt die Länge anhand von Referenzobjekten im Bild und berechnet das wahrscheinliche Gewicht.
- Spots & Karte: "Speichere diesen Spot als See" genügt — du legst den Angelplatz per Aktion add_spot an (Gewässertypen: See, Fluss, Teich, Kanal, Bach). Auf der Karte sieht der Nutzer seine Spots mit Markern und kann sie mit Notizen pflegen.
- KI-Angelempfehlung (Dashboard): kombiniert das aktuelle Wetter am Standort mit dem persönlichen Fangbuch und liefert Bewertung der Bedingungen, beste Beißzeiten, Köder-Empfehlungen, Zielfische und konkrete Tipps.
- Wetter: aktuelle Bedingungen und Vorhersage mit Angel-Bezug — du kannst erklären, was Luftdruck, Wind und Bewölkung fürs Beißverhalten bedeuten.
- Wasseranalyse: zeigt Gewässerwerte wie pH, Temperatur und Trübung; du erklärst, wie man bei diesen Werten am besten fischt.
- Fischverhaltens-Analyse: liefert für eine Fischart Aktivitätslevel, beste Zeiten, Fresszonen, empfohlene Tiefe, Köder und Techniken passend zu Luftdruck und Gewässerdaten.
- Fangbericht & Statistik: Auf Wunsch fasst du die Fänge eines Zeitraums als Bericht zusammen ("Erstell mir einen Fangbericht der letzten 30 Tage"); die Statistik-Seite zeigt größte Fänge, häufigste Arten und Trends.
- Events & Community: Wettbewerbe mit Leaderboard und Punkten, Community-Vergleiche und Clans. Fänge während eines Events bringen Punkte fürs Ranking.
- Ausrüstung: Verwaltung von Ruten, Rollen und Zubehör; du hilfst bei der Auswahl passender Ausrüstung für Zielfisch und Methode.
- Quiz & Angelschein: Übungsfragen zur Vorbereitung auf die Angelschein-Prüfung — du kannst auch direkt im Chat Prüfungswissen abfragen und erklären.
- Knoten-Guide: Schritt-für-Schritt-Anleitungen für Angelknoten; du erklärst jeden Knoten zusätzlich selbst im Chat.
- Köder-Seite & Köder-Mixer: Köder-Übersicht und Rezepte für eigene Ködermischungen basierend auf Zielfisch und Bedingungen.
- Transparenzbereich "Das weiß BaitBuddy über dich" (Seite BuddyKnowsYou): zeigt offen, was du über den Nutzer weißt — gespeicherte Zielfische, Methoden, Gewässertypen, No-Gos, Erfahrung, Region, Ziele, die bekannte Ausrüstung und Touren sowie die aus dem Fangbuch abgeleiteten Muster mitsamt Stichprobe. Jede Angabe ist dort korrigierbar und löschbar. Weise aktiv darauf hin, wenn jemand fragt, was du über ihn weißt, wenn du etwas falsch angenommen hast oder wenn er seine Angaben ändern will ("Sag einfach: Was weißt du über mich" — du öffnest die Seite per Aktion navigate).
- 3D-Köderanimation (Seite Koeder3D): zeigt Wobbler, Gummifisch am Jigkopf, Spinner, Blinker und Oberflächenköder als 3D-Animation mit echtem Laufverhalten — Führungsstile wie Jiggen, Faulenzen, Stop-and-Go, Twitchen und Walk the Dog lassen sich live umschalten, mit Tempo-Regler und frei drehbarer Kamera. Biete sie aktiv an, wenn jemand eine Köderführung erklärt haben will ("Sag einfach: Zeig mir, wie ein Gummifisch läuft" — du öffnest die Seite per Aktion navigate auf Koeder3D).
- Tutorials: Lernvideos und Anleitungen von Anfänger bis Profi — immer nur ERGÄNZEND zu deiner eigenen Erklärung erwähnen, nie als Ersatz.
- Sprachsteuerung & Voice-Buddy: Der Nutzer kann komplett per Sprache mit dir reden — als Einzelfrage per Mikrofon oder im fortlaufenden Live-Gespräch.
- Navigation: Du kannst jede Seite der App öffnen ("Öffne die Karte", "Zeig mein Fangbuch") — per Aktion navigate.
- Fischrezepte (Seite FishRecipes): Nach jedem gespeicherten Fang schlägt die App Rezepte vor — Braten, Räuchern, Beizen, Grillen u.v.m., mit Zutaten und Schwierigkeitsgrad. Bei Catch & Release erscheint ein nachhaltiger Hinweis statt Rezepten. Biete Rezepte aktiv an, wenn der Nutzer einen Fang erwähnt, den er behalten möchte ("Sag: Zeig mir Rezepte für meinen Hecht" — du öffnest FishRecipes per Aktion navigate).
- Ausrüstungserkennung (Seite GearRecognition): Der Nutzer fotografiert Rute, Rolle, Köder oder komplettes Setup — die KI erkennt die Gegenstände und schlägt vor, sie direkt zur Ausrüstungsliste hinzuzufügen. Nützlich beim Kauf neuer Ausrüstung oder beim Einpflegen vorhandener Sachen. Biete die Funktion an, wenn Ausrüstung erwähnt wird ("Sag: Erkennung starten" — du öffnest GearRecognition per navigate).
- Ausrüstungswartung (Seite GearMaintenance): Protokolliert Schnurwechsel, Rollenpflege, Hakenprüfung usw., erinnert an überfällige Wartungen und analysiert per KI, was als nächstes fällig ist. Biete die Funktion an, wenn Pflege oder Wartung erwähnt wird ("Sag: Wartungsprotokoll öffnen" — du öffnest GearMaintenance per navigate).
- Schonzeiten-Assistent (Seite RuleAssistant): Zeigt aktuell geltende Schonzeiten und Mindestmaße für die 20 häufigsten Fischarten, prüft eine eingegebene Fischlänge gegen das Mindestmaß und beantwortet spezifische Regelfragen per KI-Auskunft für ein gewähltes Bundesland. Öffne RuleAssistant per navigate, wenn nach Schonzeiten oder Mindestmaßen gefragt wird.
- Offline-Angelpack (Seite OfflineFishingPack): Lädt Spots, Fangbuch und Schonzeiten für die Nutzung ohne Internetverbindung herunter. Biete es aktiv an, wenn Offline-Angeln oder Netzprobleme erwähnt werden ("Sag: Offline-Pack laden" — du öffnest OfflineFishingPack per navigate).
- Benachrichtigungs-Center (Seite NotificationCenter): Zeigt den Verlauf aller Benachrichtigungen, lässt Kategorien (Wetter, Events, Community, Ausrüstung) ein- und ausschalten und ermöglicht Ruhezeiten. Öffne es per navigate auf Anfrage.
- Sicherheitsmodus (automatisch): Bei extremen Wetterwarnungen (Gewitter, Sturm, Hochwasser) erscheint automatisch ein Sicherheits-Banner mit Empfehlungen und der Option, den Trip zu pausieren oder zu beenden. Erkläre dies, wenn Nutzer nach Sicherheit oder Wetterextremereignissen fragen.
Wenn der Nutzer etwas erzählt, das zu einer Funktion passt (z. B. von einem Fang berichtet oder einen neuen Platz erwähnt), biete den passenden Handgriff aktiv an, statt zu warten, bis er fragt.`;

export const FISHING_KNOWLEDGE = `DEIN PRAXISWISSEN (nutze es aktiv für vollständige, konkrete Antworten):

GUMMIFISCH (Spinnfischen):
- Montage: Jighaken passend zur Köderlänge (Köder 8cm ≈ Hakengröße 2/0–3/0, 12cm ≈ 4/0–5/0). Haken neben den Köder halten, Austrittsstelle markieren, Köder gerade und faltenfrei aufziehen — ein krummer Gummifisch läuft nicht.
- Jigkopf-Gewicht: Faustregel 1g pro Meter Wassertiefe, plus Zuschlag bei Strömung/Wind. Barsch 3–7g, Zander 5–14g, Hecht 10–30g. Richtig gewählt ist es, wenn der Köder nach dem Rutenschlag 2–4 Sekunden bis zum Grund braucht.
- Führung "Jiggen": Auswerfen, Köder an gespannter Schnur zum Grund sinken lassen (Schnurbogen beobachten!), dann 1–2 schnelle Kurbelumdrehungen oder ein Rutenschlag nach oben, wieder an straffer Schnur absinken lassen. Der Biss kommt fast immer in der Absinkphase — zuckt oder springt die Schnur, sofort anschlagen.
- Führung "Faulenzen": Rute ruhig auf ca. 10 Uhr halten, nur über die Rolle beschleunigen (2–3 rasche Umdrehungen), dann Pause zum Absinken. Ideal für Zander im Winter, weil der Köder gleichmäßiger läuft.
- Wo: Kanten, Abbruchkanten, Löcher, Hafeneinfahrten, vor Schilfgürteln. Zander im Sommer nachts flach am Ufer, im Winter tief in den Löchern.
- Hecht: immer Stahl- oder dickes Fluorocarbon-Vorfach (mind. 0,80mm), sonst Abbiss. Bei Fehlbissen Angsthaken (Stinger) im hinteren Drittel montieren.

UNTERWASSER-KÖDERBOX / FUTTERKORB-SYSTEME:
- Zweck: Futter direkt am Angelplatz freisetzen und Fische auf den Spot locken, ohne breit anzufüttern.
- Einsatz Schritt für Schritt: Box mit Partikelfutter/Pellets/Madenmix befüllen (nicht zu fest stopfen, es muss durch die Öffnungen austreten können), Box beschweren oder am Futterkorb-System einhängen, an Schnur oder Seil exakt am Spot absenken (Position z.B. per Marker oder Uferpeilung merken), Montage mit dem Hakenköder 0,5–2m daneben platzieren.
- Nachfüllen alle 45–90 Minuten, im kalten Wasser seltener und weniger. Kleine Öffnungen für feines Futter/Maden, große für Pellets und Partikel.
- Method Feeder als verwandtes System: Futter um den Korb drücken, Hakenköder (Pellet/Mini-Boilie am Haar) direkt ins Futter einbetten, straffe Schnur — die Fische haken sich meist selbst.
- Rechtlicher Hinweis: Anfüttern ist regional unterschiedlich geregelt — Gewässerordnung prüfen.

WEITERE KUNSTKÖDER:
- Wobbler: Tauchtiefe steht meist auf der Verpackung und hängt von der Schaufel ab. Führung: einleiern mit Stopps (Stop-and-Go) oder Twitchen (kurze Schläge mit der Rutenspitze bei halb lockerer Schnur, dazwischen Pausen — die Pause bringt den Biss).
- Spinner/Blinker: gleichmäßig so langsam einholen, dass das Blatt gerade noch dreht; in Flüssen schräg stromauf werfen und mit der Strömung führen. Nach dem Auswurf Absinkzeit zählen, um verschiedene Tiefen abzusuchen.
- Oberflächenköder (Popper/Stickbait): Popper mit kurzen Schlägen "blubbern" lassen, Stickbait im Zickzack führen (Walk the Dog: rhythmische kleine Schläge bei lockerer Schnur). Nach dem Biss erst anschlagen, wenn der Fisch wirklich Druck macht.

NATURKÖDER & FRIEDFISCH:
- Wurm/Made an Posen- oder Grundmontage: Haken 8–12 für Made, 4–8 für Tauwurm. Pose vorher exakt ausloten, Köder knapp über oder auf Grund anbieten.
- Köderfisch (tot) für Hecht/Zander/Aal/Wels: an Grund- oder Posenmontage mit Ryder- und Drillingshaken-System; für Zander kleine Köfis (6–10cm) und Einzelhaken, Anhieb früh setzen.
- Karpfen: Haarmontage — Boilie/Mais sitzt am "Haar" hinter dem blanken Haken, Selbsthakeffekt mit 60–100g Festblei. Vorher Spot anfüttern und Distanz mit Schnurclip festlegen.
- Forelle (Teich): Bienenmade oder Teig am Sbirolino oder an der Tremarella-Montage; Teig zum Propeller formen, sehr langsam mit zitternder Rutenspitze einholen.

MONTAGEN (Raubfisch-Finesse):
- Drop Shot: Haken 30–80cm über dem Endblei direkt an die Schnur (Palomar, Hakenspitze zeigt nach oben), Köder am Platz zupfen lassen ohne ihn einzuholen — stark für träge Barsche und Zander.
- Carolina/Texas: Durchlaufblei (Bullet) vor dem Vorfach bzw. direkt vor dem Offset-Haken; Offset-Haken macht den Köder krautfrei — durch Hindernisse und Kraut ziehen, wo Jigköpfe hängen bleiben.
- Cheburashka: austauschbares Klemmblei plus frei beweglicher Haken — der Köder spielt natürlicher als am starren Jigkopf.

KNOTEN (die vier wichtigsten):
- Verbesserter Clinch: Standard für Haken/Wirbel an Mono/Fluoro — 5–7 Windungen, durch die kleine und dann die große Schlaufe zurück, anfeuchten, zuziehen.
- Palomar: stärkster einfacher Knoten, ideal für Geflecht und Drop Shot — Doppelschnur durchs Öhr, Überhandknoten, Schlaufe über den Haken stülpen.
- Albright/FG: Verbindung Geflecht zu Fluorocarbon-Vorfach; FG hält am besten, Albright ist schneller gebunden.
- Schlaufenknoten (Rapala): gibt Wobblern und Jigs freies Spiel, wenn kein Snap verwendet wird.
- Immer gilt: Knoten vor dem Zuziehen anfeuchten, danach mit Zug testen.

DRILL, LANDUNG & HANDLING:
- Bremse vor dem ersten Wurf auf etwa ein Drittel der Schnurtragkraft einstellen (per Hand von der Rolle ziehen — sie soll unter Druck surrend Schnur freigeben).
- Drill: Rute im 45–90°-Winkel halten, nie auf den Fisch zeigen ("pumpen": Rute heben, beim Absenken kurbeln). Flucht laufen lassen, nicht gegenkurbeln.
- Landung: Fisch kopfvoran in den Kescher (gummierte Netze schonen die Schleimhaut), nasse Hände oder Abhakmatte, Hakenlöser/Zange bereit. Beim Zurücksetzen den Fisch im Wasser stützen, bis er selbst wegschwimmt.
- Waidgerechtes Töten (wo vorgeschrieben): Betäubung durch Schlag auf den Hinterkopf, danach Herzstich — regionale Regeln und Schonmaße immer beachten.

JAHRESZEIT & BEDINGUNGEN:
- Frühjahr: flache, sich schnell erwärmende Buchten; nach der Schonzeit sind Raubfische ufernah. Sommer: Morgen- und Abenddämmerung, tagsüber tiefere, kühlere Bereiche; Zander nachts flach. Herbst: beste Raubfischzeit, größere Köder, Fische fressen sich Winterspeck an. Winter: langsame Führung (Faulenzen, Vertikal), tiefe Löcher, Mittagszeit.
- Fallender Luftdruck vor einer Front macht Raubfische oft aktiv; bei Ostwind und Hochdruck eher Finesse-Methoden und kleinere Köder. Trübes Wasser: laute, grelle Köder (Firetiger, Rasseln); klares Wasser: natürliche Dekore und dünnere Vorfächer.`;

// Offline FAQ/QA-Wissensbasis: Häufig gestellte Fragen mit Anfänger- und Profi-Antworten.
// Diese Daten sind offline verfügbar und erfordern keine API-Kosten. Der Buddy wählt
// die passende Antwort je nach User-Level oder erklärt die Konzepte in eigenen Worten.
const faqData = [
  { id: 1, question: "Wie funktioniert die Montage für Drop-Shot?", beginner: "Blei unten am Ende der Schnur, Haken ca. 50cm darüber.", expert: "Vertikale Führung mit extrem feiner Spitzenaktion zur Imitation verletzter Beutefische." },
  { id: 2, question: "Wann ist die beste Jahreszeit für Zander?", beginner: "Mai/Juni nach der Schonzeit und Herbst.", expert: "Nachtangeln im Hochsommer flach, ab Herbst in tiefen Kanten und Fahrrinnen." },
  { id: 3, question: "Welcher Futterkorb ist am See am besten?", beginner: "Runder Drahtkorb für gleichmäßige Futterabgabe.", expert: "Flache Form oder Pellet-Feeder bei schlammigem Grund zur optimalen Köderpräsentation." },
  { id: 4, question: "Wie erkennt man einen Biss beim Forellenangeln?", beginner: "Ruckartige Bewegung der Rutenspitze.", expert: "Beobachtung des Schnurverhaltens und extrem sensible Bremseinstellung für Widerstandslosigkeit." },
  { id: 5, question: "Welches Mindestmaß gilt für Hecht?", beginner: "Gesetzliches Mindestmaß (je nach Bundesland).", expert: "Entnahme erst ab deutlich über dem Mindestmaß zum Schutz der Laichbestände." },
  { id: 6, question: "Wann beginnt die Schonzeit für Zander?", beginner: "In den meisten Bundesländern von Mitte März bis Ende Mai.", expert: "Variiert regional stark; Schutz der Laichzeit steht im Fokus der Bestandsregelung." },
  { id: 7, question: "Welche Rute ist gut zum Spinnfischen?", beginner: "Eine Rute mit 2,40 m Länge und 20-50g Wurfgewicht.", expert: "Schnelle Spitzenaktion (Fast Taper) für präzise Köderführung und direkte Rückmeldung." },
  { id: 8, question: "Wie binde ich den Palomar-Knoten?", beginner: "Einfach: Schnur doppelt legen und durch das Öhr führen.", expert: "Hervorragender Knoten für Fluorocarbon; extrem hohe Tragkraft bei korrekter Wicklung." },
  { id: 9, question: "Ist Nachtangeln an diesem See erlaubt?", beginner: "Bitte in der Erlaubniskarte prüfen.", expert: "Rechtliche Grundlage oft in der Gewässerordnung; Lichtverschmutzung/Lärmschutz beachten." },
  { id: 10, question: "Welcher Blinker funktioniert bei klarem Wasser?", beginner: "Silberne/Natürliche Dekore.", expert: "Einsatz von sehr dünnen, silbernen Modellen mit unauffälligerem Laufverhalten." },
  { id: 11, question: "Wie bereite ich einen Futterplatz vor?", beginner: "An drei Tagen vor dem Angeln leicht anfüttern.", expert: "Strategischer Aufbau über eine Woche; Partikel und Boilies exakt spotten." },
  { id: 12, question: "Gibt es eine Fangbeschränkung für Barsch täglich?", beginner: "Oft 3-5 Fische oder keine.", expert: "Entnahmefenster beachten; Fokus auf Bestandserhaltung der Laichfische." },
  { id: 13, question: "Welche Angelschnur ist am reißfestesten?", beginner: "Geflochtene Schnur.", expert: "High-End PE-Geflecht mit hoher Rundung; Abriebfestigkeit ist entscheidend." },
  { id: 14, question: "Wie vermeide ich Hänger im Schilf?", beginner: "Wobbler mit Tauchschaufel wählen.", expert: "Offset-Haken mit Texas- oder Carolina-Rig nutzen; weniger Bodenkontakt." },
  { id: 15, question: "Wie tief sollte ich im Sommer fischen?", beginner: "Im tiefen Wasser oder an Schattenplätzen.", expert: "Auf Sprungschicht (Thermokline) achten; Fische suchen kühleres, sauerstoffreiches Wasser." },
  { id: 16, question: "Woran erkenne ich einen Zanderbiss?", beginner: "Ein kurzes 'Tock' oder plötzlicher Widerstand.", expert: "Harte Rutenaktion sorgt für sofortige Übertragung; Zander 'tockt' oft bei der Absinkphase." },
  { id: 17, question: "Welche Rolle eignet sich für das Feedern?", beginner: "Freilaufrolle oder spezielle Feederrolle.", expert: "Große Spulendurchmesser für schnelle Einholgeschwindigkeit; starkes Getriebe." },
  { id: 18, question: "Wie bewahre ich Köderfische auf?", beginner: "Kühler Eimer mit Wasser.", expert: "Beli-Systeme oder Sauerstoffpumpen; Frische ist entscheidend für das Raubfisch-Ergebnis." },
  { id: 19, question: "Ist das Anfüttern an diesem Gewässer erlaubt?", beginner: "Gewässerordnung lesen.", expert: "Strenge Limitierung oft durch Futterverbote zum Schutz der Wasserqualität." },
  { id: 20, question: "Wie binde ich ein Vorfach für Karpfen?", beginner: "Standard-Karpfenhaken mit Haar-Montage.", expert: "D-Rig oder Ronnie-Rig für bessere Hakrate und Pop-Up Präsentation." },
  { id: 21, question: "Welche Wobbler sind gut für Hecht?", beginner: "Große Modelle ab 15cm.", expert: "Jerkbaits oder Swimbaits; Fokus auf Druckwellen durch große Tauchschaufeln." },
  { id: 22, question: "Wie lande ich einen Fisch schonend?", beginner: "Großer gummierter Kescher.", expert: "Vermeidung von Kontakt mit dem Boden; Fisch auf Abhakmatte versorgen." },
  { id: 23, question: "Wann sind Friedfische am aktivsten?", beginner: "Bei steigenden Temperaturen.", expert: "Früh morgens oder spät abends; Wetterumschwünge triggern Fressphasen." },
  { id: 24, question: "Welches Gewicht sollte das Blei haben?", beginner: "Passend zur Strömung.", expert: "Minimal-Prinzip: So leicht wie möglich, so schwer wie nötig." },
  { id: 25, question: "Wie löse ich einen festen Haken?", beginner: "Geduld und nicht ziehen.", expert: "Lösestange oder Hakenlöser mit der richtigen Technik unter Zug und Gegendruck." },
  { id: 26, question: "Was bedeutet 'C&R' in der Fischerei?", beginner: "Catch and Release.", expert: "Waidgerechtes Zurücksetzen zur Schonung des Fischbestands; Ethik beachten." },
  { id: 27, question: "Gibt es eine Fischereiprüfungspflicht?", beginner: "Ja, in Deutschland Pflicht.", expert: "Grundlage für die Erteilung des Fischereischeins; rechtliche Hürde." },
  { id: 28, question: "Welches Fischfutter lockt Brassen an?", beginner: "Süßes Grundfutter.", expert: "Mischung mit Partikeln; Fokus auf grobe Struktur bei Strömung." },
  { id: 29, question: "Wie stelle ich die Bremse richtig ein?", beginner: "Dass sie unter Zug Schnur freigibt.", expert: "Kurz vor der Bruchgrenze der Schnur; Einstellung vor Beginn prüfen." },
  { id: 30, question: "Warum beißen die Fische heute nicht?", beginner: "Wetterumschwung oder Druck.", expert: "Luftdruckänderungen; Fische stehen oft im Mittelwasser statt am Grund." },
  { id: 31, question: "Wo finde ich Informationen zu Schonzeiten?", beginner: "Angelverein oder App.", expert: "Amtliche Fischereigesetze des jeweiligen Bundeslandes." },
  { id: 32, question: "Wie erkenne ich eine Krankheit beim Fisch?", beginner: "Pilzbefall oder Hautveränderungen.", expert: "Fisch sofort entnehmen; Aufklärungs- und Meldepflicht bei Massensterben." },
  { id: 33, question: "Welche Pose ist ideal für Strömung?", beginner: "Strompose mit schwerem Bauch.", expert: "Flache Form, die wenig Angriffsfläche gegen Strömung bietet." },
  { id: 34, question: "Wie transportiere ich meine Ausrüstung?", beginner: "Futteral und Angelkasten.", expert: "Vermeidung von Knicken in den Ruten; Schutz der Ringe und Spitzen." },
  { id: 35, question: "Sind Kunstköder immer erlaubt?", beginner: "Nicht in allen Gewässern.", expert: "In Raubfischschonzeiten oft explizit verboten; Regeln vor Ort prüfen." },
  { id: 36, question: "Wie funktioniert das Angeln mit Gummifisch?", beginner: "Auswerfen und einkurbeln.", expert: "Jiggen/Faulenzen: Köder hüpfen lassen durch Rutenschläge oder Einholen." },
  { id: 37, question: "Wie verwende ich Lockstoffe?", beginner: "Sparsam auf den Köder.", expert: "Dosierung nur auf den Köder-Körper; Überdosierung kann verscheuchen." },
  { id: 38, question: "Welche Kleidung ist beim Angeln sinnvoll?", beginner: "Zwiebelprinzip.", expert: "Atmungsaktive Outdoor-Kleidung mit Schutz gegen Wind und Regen." },
  { id: 39, question: "Wie erkenne ich ein Laichgewässer?", beginner: "Flache, bewachsene Uferzonen.", expert: "Schongebiete oft durch Bojen oder Hinweise markiert; Ruhe bewahren." },
  { id: 40, question: "Wie lange ist eine Tageskarte gültig?", beginner: "Meist 24 Stunden.", expert: "Gilt oft ab 0 Uhr des jeweiligen Kalendertages." },
  { id: 41, question: "Was mache ich bei einem Gewitter?", beginner: "Rute wegstellen, weg vom Wasser.", expert: "Gefahr durch Blitzschlag bei Carbonruten; Schutz in festem Gebäude suchen." },
  { id: 42, question: "Wie messe ich die Wassertemperatur?", beginner: "Thermometer.", expert: "Messung in verschiedenen Tiefen zeigt Sprungschicht an." },
  { id: 43, question: "Wie oft muss ich die Schnur wechseln?", beginner: "Einmal pro Saison.", expert: "Bei sichtbarer Aufrauung oder Farbveränderung sofort tauschen." },
  { id: 44, question: "Gibt es Schongebiete am See?", beginner: "Meist per Schild markiert.", expert: "Nicht betretbare Zonen; Dienen der Reproduktion der Fische." },
  { id: 45, question: "Welches Öl schützt meine Rolle?", beginner: "Spezial-Rollenfett.", expert: "Vermeidung von aggressivem Öl; regelmäßige Wartung der Kugellager." },
  { id: 46, question: "Was mache ich mit dem Beifang?", beginner: "Sofort schonend zurücksetzen.", expert: "Haken vorsichtig lösen; falls tief geschluckt, Schnur kappen." },
  { id: 47, question: "Wie binde ich einen Wirbel ein?", beginner: "Verbesserter Clinch-Knoten.", expert: "Doppelte Sicherung durch durchgeführte Schlaufe; verhindert Knotenbruch." },
  { id: 48, question: "Welche Hakengröße brauche ich?", beginner: "Passend zum Köder.", expert: "Kleine Haken für Maden/Mais, große für Fischstücke/große Boilies." },
  { id: 49, question: "Was tun bei einem Angler-Notfall?", beginner: "Erste Hilfe und Notruf.", expert: "Rettungskette einleiten; Position anhand von Landmarks mitteilen." },
  { id: 50, question: "Sind Echolote an diesem Gewässer erlaubt?", beginner: "In der Erlaubniskarte prüfen.", expert: "Teilweise verboten, um den Bestand nicht ungleichmäßig zu bejagen." },
  { id: 51, question: "Wie lange bleibt ein Angelplatz geheim?", beginner: "So lange wie möglich.", expert: "Profis 'füttern' Plätze über lange Zeit vor und hüten diese als 'Hotspots'." },
  { id: 52, question: "Wie erkenne ich gute Angelplätze?", beginner: "Dort wo sich Fische aufhalten.", expert: "Strukturwechsel am Grund, Krautkanten, überhängende Bäume." },
  { id: 53, question: "Ist Angeln bei Frost sinnvoll?", beginner: "Schwierig, aber möglich.", expert: "Ja, bei klarem Wasser im Winter auf Friedfische (besonders Karpfen/Barsch) in tiefen Bereichen." },
  { id: 54, question: "Welche Knoten sind die sichersten?", beginner: "Standard-Clinch-Knoten.", expert: "Grinner-Knoten oder Albright-Knoten für Verbindung Geflecht zu Mono." },
  { id: 55, question: "Warum braucht man einen Kescher?", beginner: "Um den Fisch sicher zu landen.", expert: "Um den Fisch schonend zu keschern und Verletzungen durch Sturz zu vermeiden." },
  { id: 56, question: "Wie reinige ich meine Ausrüstung?", beginner: "Mit einem feuchten Tuch abwischen.", expert: "Nach Meereskontakt mit Süßwasser abspülen; Rollen ölen, Rutenringe reinigen." },
  { id: 57, question: "Darf ich am Ufer zelten?", beginner: "Je nach Landesrecht.", expert: "Meist ist das 'Lagern' (ohne Boden) erlaubt, aber Zelten oft verboten." },
  { id: 58, question: "Wie bereite ich einen Hecht für die Küche vor?", beginner: "Filetieren nach dem Schlachten.", expert: "Ganzes Tier ausnehmen, Schuppen entfernen, Kopf ab, dann filetieren." },
  { id: 59, question: "Was ist die beste Angelstelle am frühen Morgen?", beginner: "Flache Uferzonen.", expert: "Fische sind nach der Nacht oft in der Ufernähe auf Nahrungssuche." },
  { id: 60, question: "Wie funktioniert die Posenmontage?", beginner: "Pose mit Blei ausbalancieren.", expert: "Pose muss so austariert sein, dass nur die Spitze herausschaut." },
  { id: 61, question: "Welche Köderfischgröße ist ideal?", beginner: "Ca. 10 cm.", expert: "Je nach Zielfisch, für große Hechte auch 20+ cm." },
  { id: 62, question: "Warum ist Sauerstoff wichtig für Fische?", beginner: "Zum Atmen.", expert: "Sauerstoffmangel führt zum Fischsterben; Fische stehen bei Hitze in kühlen Strömungen." },
  { id: 63, question: "Wie verhalte ich mich bei Fischsterben?", beginner: "Verein informieren.", expert: "Nicht den Fisch anfassen, Fundort genau protokollieren." },
  { id: 64, question: "Wo bekomme ich einen Angelschein?", beginner: "Bei der Stadt oder Angelverein.", expert: "Nach bestandener Prüfung beim Ordnungsamt." },
  { id: 65, question: "Kann ich online Karten kaufen?", beginner: "Ja, über Angelportale.", expert: "Ja, z.B. bei Händlerseiten oder offiziellen Gewässerportalen." },
  { id: 66, question: "Wie groß sollte ein Angelkasten sein?", beginner: "So groß wie nötig.", expert: "Profis nutzen modular aufgebaute Tackleboxen für maximale Übersicht." },
  { id: 67, question: "Wie lange ist ein Fisch haltbar?", beginner: "Kühl ca. 24 Stunden.", expert: "Gereinigt und vakuumiert in der Tiefkühltruhe bis zu 6 Monate." },
  { id: 68, question: "Wann zieht der Aal?", beginner: "Bei warmen Nächten.", expert: "Aale sind nachtaktiv und ziehen bei steigenden Wassertemperaturen." },
  { id: 69, question: "Gibt es Apps für Fisch-Identifikation?", beginner: "Ja, diverse Bestimmungs-Apps.", expert: "Auch Bildsuche-Tools oder offizielle Fisch-Datenbanken des Landes." },
  { id: 70, question: "Warum sind Schuppen am Fisch wichtig?", beginner: "Schutzschicht.", expert: "Schuppen schützen vor Parasiten und Verletzungen." },
  { id: 71, question: "Was bewirkt der Mond auf das Beißverhalten?", beginner: "Oft diskutiert, wenig bewiesen.", expert: "Viele Angler schwören auf Mondphasen; belegt ist der Einfluss auf die Gezeiten." },
  { id: 72, question: "Wie binde ich ein Stahlvorfach?", beginner: "Mit Quetschhülsen.", expert: "Quetschhülse doppelt durch, dann fest mit der Zange pressen." },
  { id: 73, question: "Wie befestige ich einen Schwimmer?", beginner: "Mit Posenstoppern.", expert: "Mit Silikon-Stoppern oder Schnurstoppern (bei Laufposen)." },
  { id: 74, question: "Welche Angelweste ist am besten?", beginner: "Mit vielen Taschen.", expert: "Westen mit großem Rücken-Staufach und schneller Zugriffsmöglichkeit." },
  { id: 75, question: "Wie funktioniert eine Multirolle?", beginner: "Über eine Querachse.", expert: "Schnur wird direkt von der Spule abgezogen; ideal für schwere Gewichte." },
  { id: 76, question: "Warum schnurt die Rolle bei Kälte?", beginner: "Fett wird zäh.", expert: "Spezialöle nutzen, die temperaturstabil bleiben." },
  { id: 77, question: "Welcher Köder im Frühjahr?", beginner: "Wurm oder Made.", expert: "Nach der Winterruhe sind Fische träge, Naturköder sind meist fängiger." },
  { id: 78, question: "Wie messe ich die Tiefe am Gewässer?", beginner: "Mit einem Lotblei.", expert: "Blei einhängen, auswerfen und so lange Posen-Tiefe korrigieren, bis sie steht." },
  { id: 79, question: "Ist der Hecht ein Raubfisch?", beginner: "Ja, absolut.", expert: "Er ernährt sich fast ausschließlich von anderen Fischen." },
  { id: 80, question: "Wie erkenne ich die Laichzeit?", beginner: "Oft durch Trägheit.", expert: "Fische stehen im Flachwasser und 'rollen'; Laichschutz einhalten." },
  { id: 81, question: "Kann ich gefrorene Köder benutzen?", beginner: "Ja.", expert: "Oft sogar besser, da sie beim Auftauen Lockstoffe abgeben." },
  { id: 82, question: "Wie lagere ich Angeln am besten?", beginner: "Hängend.", expert: "So, dass keine Spannung auf den Spitzen liegt." },
  { id: 83, question: "Welche Sonnenbrille beim Angeln?", beginner: "Polarisiert.", expert: "Polarisation nimmt die Lichtreflexionen von der Wasseroberfläche weg." },
  { id: 84, question: "Wie binde ich einen Haken am Vorfach?", beginner: "Knotenlos-Knoten.", expert: "Der Klassiker für Karpfenmontagen mit Haar-Montage." },
  { id: 85, question: "Was ist 'Anfüttern' genau?", beginner: "Köder vor dem Angeln ausbringen.", expert: "Erstellen eines Futterplatzes, um Fische zu binden." },
  { id: 86, question: "Wie funktionieren elektrische Bissanzeiger?", beginner: "Piepton bei Schnurabzug.", expert: "Sensor erkennt Schnurbewegung und löst ein akustisches Signal aus." },
  { id: 87, question: "Darf ich Fische in den Teich setzen?", beginner: "Nein, verboten.", expert: "Besatz muss immer durch den Bewirtschafter erfolgen." },
  { id: 88, question: "Welche Farben sieht der Fisch am besten?", beginner: "Kontrastreiche Farben.", expert: "Rot verschwindet tief unter Wasser; Gelb und Chartreuse sind gut sichtbar." },
  { id: 89, question: "Wie wichtig ist eine Stirnlampe?", beginner: "Sehr wichtig bei Nacht.", expert: "Beim Angeln sind Hände frei für das Versorgen des Fisches." },
  { id: 90, question: "Gibt es Apps für das Wetter am See?", beginner: "Ja.", expert: "Wetter-Apps mit Windvorhersage sind für Bootsangler essenziell." },
  { id: 91, question: "Wie erkenne ich den richtigen Köder?", beginner: "Durch Ausprobieren.", expert: "Testen: Welcher Köder passt zum aktuellen Futterangebot?" },
  { id: 92, question: "Was bedeutet 'Drop-Shot' übersetzt?", beginner: "Kurzfassung für 'Fall-Wurf'.", expert: "Angelmethode, bei der Köder vertikal präsentiert wird." },
  { id: 93, question: "Wie fische ich mit Naturködern?", beginner: "Am Haken anbieten.", expert: "Wurm, Maden oder Fischstücke sind natürlich und fängig." },
  { id: 94, question: "Gibt es spezielle Angeln für Kinder?", beginner: "Ja, kürzere Ruten.", expert: "Ruten müssen leicht und robust sein, um Frust zu vermeiden." },
  { id: 95, question: "Was mache ich, wenn ein Fisch schluckt?", beginner: "Nicht reißen.", expert: "Vorfach kappen und Fisch schonend behandeln." },
  { id: 96, question: "Wie wichtig ist eine Abhakmatte?", beginner: "Sehr wichtig.", expert: "Vermeidet Verletzungen der Schleimhaut durch Bodenkontakt." },
  { id: 97, question: "Welche Fische stehen am Grund?", beginner: "Brassen, Karpfen, Zander.", expert: "Fische, die sich von Bodenorganismen ernähren." },
  { id: 98, question: "Warum ist eine Angelschnur farbig?", beginner: "Tarnung oder Sichtbarkeit.", expert: "Transparente für scheue Fische, bunte für Wurfkontrolle." },
  { id: 99, question: "Wie oft füttere ich am Futterplatz?", beginner: "Anfangs mehr, dann weniger.", expert: "Ständige Nachfütterung hält Fische am Platz, ohne sie zu sättigen." },
  { id: 100, question: "Gibt es Angelvereine in der Nähe?", beginner: "Ja.", expert: "Über Verbandsseiten oder Google Maps suchen." },
  { id: 101, question: "Wie pflege ich meine Rutenringe?", beginner: "Mit einem weichen Tuch.", expert: "Ringe auf Schnüreinschnitte prüfen; sonst droht Schnurbruch." },
  { id: 102, question: "Ist Angeln im Regen erfolgreich?", beginner: "Oft ja.", expert: "Sauerstoffeintrag durch Regen aktiviert Fische." },
  { id: 103, question: "Was sind 'Friedfische'?", beginner: "Fische ohne Zähne/Raubfischgebiss.", expert: "Karpfen, Brassen, Rotaugen – ernähren sich pflanzlich/klein." },
  { id: 104, question: "Wie groß muss ein Fisch sein?", beginner: "Mindestmaß beachten.", expert: "Jeder Fisch braucht eine bestimmte Größe, um sich fortzupflanzen." },
  { id: 105, question: "Welche Rute für kleine Bäche?", beginner: "Kurze Rute (1,80m).", expert: "Leichte Spinnrute, um Hindernisse zu umgehen." },
  { id: 106, question: "Wie binde ich einen Wirbel richtig?", beginner: "Grinner-Knoten.", expert: "Sicherste Verbindung zwischen Schnur und Metall." },
  { id: 107, question: "Warum ist der Wasserstand wichtig?", beginner: "Fische verändern Standplätze.", expert: "Niedrigwasser drängt Fische in tiefe Löcher." },
  { id: 108, question: "Was bedeutet der PH-Wert für Fische?", beginner: "Säuregehalt.", expert: "Zu sauer/basisch vertragen Fische nicht; ideal ist neutral." },
  { id: 109, question: "Wie funktionieren Knicklichter?", beginner: "Chemische Reaktion.", expert: "Knick-Lichtstäbchen brechen, Stoffe vermischen sich, leuchten ca. 12h." },
  { id: 110, question: "Sind Drillinge erlaubt?", beginner: "Ja, meist begrenzt.", expert: "In vielen Gewässern nur ein Drilling pro Köder." },
  { id: 111, question: "Welche Köder im trüben Wasser?", beginner: "Köder mit Rasseln.", expert: "Fische jagen im Trüben über Vibration und Geräusche." },
  { id: 112, question: "Wie erkenne ich Strömungen?", beginner: "Strukturen an der Oberfläche.", expert: "Kehrströmungen sind oft sehr gute Standplätze für Raubfische." },
  { id: 113, question: "Wie binde ich ein Drop-Shot-Rig?", beginner: "Haken direkt auf die Schnur.", expert: "Haken muss im 90 Grad Winkel stehen." },
  { id: 114, question: "Wie wichtig ist ein Filetiermesser?", beginner: "Sehr.", expert: "Scharfes Messer reduziert die Verletzungsgefahr und sorgt für saubere Schnitte." },
  { id: 115, question: "Was mache ich mit Angelabfällen?", beginner: "Mitnehmen.", expert: "Niemals in der Natur lassen; Gefahr für Wildtiere." },
  { id: 116, question: "Warum sind Schonzeiten so lang?", beginner: "Laichschutz.", expert: "Sicherstellung, dass Fisch sich reproduzieren kann." },
  { id: 117, question: "Wie tief muss der Köder für Zander?", beginner: "Grundnah.", expert: "Zander sind Bodenräuber." },
  { id: 118, question: "Gibt es eine Altersgrenze für den Schein?", beginner: "Ja, je nach Bundesland.", expert: "Kinder-Schein oft ab 10 Jahren, voller Schein ab 14/16." },
  { id: 119, question: "Wie bereite ich Boilies vor?", beginner: "Kochen.", expert: "Harte Kugeln sind selektiv gegen kleine Fische." },
  { id: 120, question: "Wie erkenne ich den Fischtyp?", beginner: "Apps oder Fischbestimmungs-Karten.", expert: "Merkmale wie Maulstellung, Schuppenform, Flossenstrahlen." },
  { id: 121, question: "Was ist ein 'Hecht-Stopp'?", beginner: "Kleiner Wirbel/Stopper.", expert: "Verhindert, dass der Hecht das Vorfach durchbeißt." },
  { id: 122, question: "Warum braucht man ein Vorfach?", beginner: "Abriebschutz.", expert: "Stahl oder dickes Fluorocarbon gegen Zähne." },
  { id: 123, question: "Wie lagere ich meine Angelschnur?", beginner: "Dunkel und trocken.", expert: "UV-Licht schädigt Kunststoff (Schnur) extrem." },
  { id: 124, question: "Wie funktionieren Spinnruten?", beginner: "Biegung beim Wurf.", expert: "KRAFT-Übertragung beim Wurf und Drill." },
  { id: 125, question: "Was tun bei Schnursalat?", beginner: "Ruhig bleiben, Schlaufen lösen.", expert: "Nie die Schnur beim Entwirren zu stark ziehen." },
  { id: 126, question: "Warum begeben sich Fische in die Tiefe?", beginner: "Temperatur.", expert: "Wassertemperatur ist unten konstanter." },
  { id: 127, question: "Ist Angeln in der Dämmerung besser?", beginner: "Oft ja.", expert: "Räuber werden aktiv, Weißfische ziehen." },
  { id: 128, question: "Welche Köder für den Winter?", beginner: "Kleine Köder.", expert: "Stoffwechsel der Fische ist reduziert." },
  { id: 129, question: "Wie erkenne ich einen Fischschwarm?", beginner: "Echolot oder Raubfischaktivität.", expert: "Kleine Fische springen an der Oberfläche." },
  { id: 130, question: "Was ist der beste Knoten für Stahl?", beginner: "Klemmhülsen.", expert: "Stahl ist zu steif für normale Knoten." },
  { id: 131, question: "Welche Rute für Karpfen?", beginner: "Starke Rute (3,00m+).", expert: "Braucht Rückgrat, um schwere Fische zu drillen." },
  { id: 132, question: "Wie bereite ich Angelteig vor?", beginner: "Mehl, Wasser, Aromen.", expert: "Teig muss fest am Haken haften." },
  { id: 133, question: "Sind Blinker laut?", beginner: "Ja.", expert: "Sie erzeugen starke Druckwellen unter Wasser." },
  { id: 134, question: "Wie wichtig ist die Schnurfarbe?", beginner: "Wenig.", expert: "Solange der Fisch nicht die Schnur direkt sieht." },
  { id: 135, question: "Darf ich mehrere Angeln nutzen?", beginner: "Meist 2.", expert: "In der Erlaubnis steht die Anzahl der Ruten." },
  { id: 136, question: "Wie erkenne ich, dass der Fisch schläft?", beginner: "Gibt es nicht.", expert: "Fische sind nicht in unserem Sinne wach/schlafend." },
  { id: 137, question: "Wie mache ich meine Rolle wieder leichtgängig?", beginner: "Reinigen, neu fetten.", expert: "Altes Fett entfernen, hochwertiges Fett nutzen." },
  { id: 138, question: "Was bedeutet 'Fliegenfischen'?", beginner: "Angeln mit Kunstfliegen.", expert: "Spezielle Wurftwelle durch Fliegenschnur-Gewicht." },
  { id: 139, question: "Wie erkenne ich einen guten Kescher?", beginner: "Gummierung.", expert: "Gummierte Netze schützen die Schleimhaut der Fische." },
  { id: 140, question: "Welche Rolle für Hecht?", beginner: "Starke Stationärrolle.", expert: "Große Übersetzung für schnelles Einholen." },
  { id: 141, question: "Warum beißen Fische bei Vollmond?", beginner: "Licht.", expert: "Sie können in der Nacht besser sehen." },
  { id: 142, question: "Wie binde ich ein Haar-Vorfach?", beginner: "Köder nicht an Haken.", expert: "Köder hängt am Haar, Fisch saugt Haken ein." },
  { id: 143, question: "Wie wichtig ist eine Schutzbrille?", beginner: "Sicherheit bei Köder.Rückschlaggefahr bei Jigs.", expert: "Augenschutz gegen hängengebliebene Kunstköder." },
  { id: 144, question: "Was mache ich mit alten Schnüren?", beginner: "Recycling-Tonne.", expert: "Nicht in den Restmüll, führt zu Tiergefährdung." },
  { id: 145, question: "Gibt es Fischschongebiete im Sommer?", beginner: "Ja.", expert: "Oft um Laichplätze herum." },
  { id: 146, question: "Wie erkenne ich einen Krebsschaden?", beginner: "Löcher.", expert: "Krebse knabbern an Ködern oder Fischen." },
  { id: 147, question: "Wann ist die Laichzeit vorbei?", beginner: "Je nach Art.", expert: "Nach den Schonzeiten." },
  { id: 148, question: "Welcher Köder lockt Welse?", beginner: "Stinkende Köder.", expert: "Welse jagen extrem über Geruch." },
  { id: 149, question: "Wie funktioniert ein Futterkorb?", beginner: "Futterfreigabe.", expert: "Durch Werfen wird Futter direkt zum Köder geliefert." },
  { id: 150, question: "Wie lange ist eine Karte gültig?", beginner: "Tag/Woche/Jahr.", expert: "Steht direkt auf der Karte." },
  { id: 151, question: "Was tun bei einem Angelunfall?", beginner: "Erste Hilfe.", expert: "Sofort Notruf absetzen und Verletzung kühlen oder abbinden." },
  { id: 152, question: "Gibt es Angel-Communities?", beginner: "Ja, Foren und Social Media.", expert: "Professioneller Austausch findet meist in Fachforen statt." },
  { id: 153, question: "Wie pflege ich mein Zubehör?", beginner: "Regelmäßig abspülen.", expert: "Fette und Öle auf Korrosionsbeständigkeit prüfen." },
  { id: 154, question: "Was bedeutet 'Feedern'?", beginner: "Angeln mit Futterkorb.", expert: "Präzises Angeln auf Grundfische mit Futterfokus." },
  { id: 155, question: "Wie erkenne ich das Alter eines Fisches?", beginner: "Schuppenanalyse (mikroskopisch).", expert: "Anhand der Jahresringe auf den Schuppen oder Gehörknöchelchen." },
  { id: 156, question: "Welche Fische springen gerne?", beginner: "Rapfen oder Forellen.", expert: "Sprünge dienen oft der Flucht oder Jagd an der Oberfläche." },
  { id: 157, question: "Wie binde ich ein Wels-Vorfach?", beginner: "Sehr starke Schnur (Mono).", expert: "Spezielle knotenlose Verbindungen mit extremen Tragkräften." },
  { id: 158, question: "Wie erkenne ich Futterfische?", beginner: "Schwärme am Echolot.", expert: "Ständige Bewegung und Kleinfisch-Aktivität beobachten." },
  { id: 159, question: "Warum brauchen manche Fische Sauerstoff?", beginner: "Stoffwechsel.", expert: "Aktive Räuber haben einen höheren Sauerstoffbedarf." },
  { id: 160, question: "Was ist eine Wathose?", beginner: "Schutzhose für Wasser.", expert: "Ermöglicht das Angeln direkt im Wasser stehend." },
  { id: 161, question: "Wie funktioniert Waten?", beginner: "Langsam und leise.", expert: "Vorsicht vor Strömung und tiefen Löchern (Gefahr!)." },
  { id: 162, question: "Warum sind Schonzeiten wichtig?", beginner: "Bestandssicherung.", expert: "Schutz der nächsten Generation vor Befischung." },
  { id: 163, question: "Welche Angel für Anfänger?", beginner: "Allround-Rute.", expert: "Nicht zu teuer, vielseitig einsetzbar (Posen/Grund)." },
  { id: 164, question: "Wie binde ich eine Schnur an die Rolle?", beginner: "Spulen-Knoten.", expert: "Wichtig ist eine feste Wicklung auf dem Spulenkern." },
  { id: 165, question: "Wie erkenne ich einen Biss beim Grundangeln?", beginner: "Rute zuckt.", expert: "Feine Spitze oder Bissanzeiger nutzen." },
  { id: 166, question: "Was mache ich, wenn die Rute bricht?", beginner: "Nicht mehr nutzen.", expert: "Rutenbruch kann Verletzungen verursachen (Splitter)." },
  { id: 167, question: "Wie lange ist Fisch im Kühlschrank?", beginner: "Maximal 1 Tag.", expert: "Bei 0-2 Grad lagern, sonst schnell Verderb." },
  { id: 168, question: "Welche Farbe bei trübem Wetter?", beginner: "Signal-Farben (Gelb/Orange).", expert: "Kontrastreiche Köder sind im Trüben besser sichtbar." },
  { id: 169, question: "Wie erkenne ich gute Angelwetter-Apps?", beginner: "Zuverlässige Windvorhersage.", expert: "Präzision bei Luftdruckveränderungen prüfen." },
  { id: 170, question: "Warum sind Bleie umweltfreundlich?", beginner: "Es gibt bleifreie Alternativen (Stein/Stahl).", expert: "Verzicht auf Blei schont das Gewässer vor Schwermetallen." },
  { id: 171, question: "Darf ich Fische lebend transportieren?", beginner: "Nur in speziellen Behältern.", expert: "Fischtransport muss immer Tierschutzrichtlinien entsprechen." },
  { id: 172, question: "Was bedeutet 'Trolling'?", beginner: "Schleppangeln.", expert: "Angeln hinter dem fahrenden Boot." },
  { id: 173, question: "Wie binde ich ein Carolina-Rig?", beginner: "Blei frei laufend vor dem Wirbel.", expert: "Vorfachlänge bestimmt die Köderpräsentation über dem Grund." },
  { id: 174, question: "Wie erkenne ich die Fischart an der Flosse?", beginner: "Flossenstrahlen zählen.", expert: "Spezifische Anzahl der Strahlen bestimmt die Art." },
  { id: 175, question: "Wann beißt der Barsch am besten?", beginner: "Morgens und abends.", expert: "Barsche jagen aktiv in Schwärmen." },
  { id: 176, question: "Wie binde ich eine Vorfachschlaufe?", beginner: "Achterknoten.", expert: "Einfachste Schlaufenverbindung für Vorfächer." },
  { id: 177, question: "Was tun bei verhedderter Schnur?", beginner: "Geduld und entwirren.", expert: "Bei starker Verwicklung Schnur abschneiden." },
  { id: 178, question: "Welche Rolle ist korrosionsbeständig?", beginner: "Mit abgedichteten Kugellagern.", expert: "Wichtig beim Einsatz in salzhaltigen Gewässern." },
  { id: 179, question: "Wie erkenne ich ein Angelverbotsschild?", beginner: "Offizielle Schilder.", expert: "Gelbe oder weiße Schilder mit Verbots-Symbol." },
  { id: 180, question: "Was bedeuten die Fisch-Symbole auf Karten?", beginner: "Vorkommen.", expert: "Zeigen an, welche Arten im Gewässer existieren." },
  { id: 181, question: "Wie binde ich ein Texas-Rig?", beginner: "Offset-Haken mit Blei.", expert: "Köder wird krautfrei am Grund geführt." },
  { id: 182, question: "Warum sind Kleinfische wichtig?", beginner: "Nahrungskette.", expert: "Sie sind das Futter für alle Raubfische." },
  { id: 183, question: "Wie wichtig ist ein Fischschuppen-Messer?", beginner: "Sehr hilfreich.", expert: "Erleichtert die Vorbereitung für die Küche enorm." },
  { id: 184, question: "Wie erkenne ich gute Boilies?", beginner: "Frischer Geruch.", expert: "Qualitäts-Boilies haben hochwertige Inhaltsstoffe." },
  { id: 186, question: "Was ist der beste Köder für große Karpfen?", beginner: "Mais oder große Boilies.", expert: "Große Köder selektieren die Fische." },
  { id: 187, question: "Wie erkenne ich die Gewässertiefe?", beginner: "Echolot oder Loten.", expert: "Wichtig für die Bestimmung der Standplätze." },
  { id: 188, question: "Wie pflege ich meine Wathose?", beginner: "Trocknen lassen.", expert: "Nach dem Einsatz innen und außen komplett trocken." },
  { id: 189, question: "Gibt es Tipps für das Angeln im Fluss?", beginner: "Strömungskanten.", expert: "Suchen nach Fischen hinter Strömungshindernissen." },
  { id: 190, question: "Wie binde ich einen Haken für Naturköder?", beginner: "Plättchen-Knoten.", expert: "Sicherer Halt für kleine Wurm-Köder." },
  { id: 191, question: "Warum beißen Fische morgens besser?", beginner: "Lichtwechsel.", expert: "Der Übergang von Nacht auf Tag löst Fressphasen aus." },
  { id: 192, question: "Was tun bei einem verletzten Haken?", beginner: "Hakenlöser nutzen.", expert: "Schnell und schonend entfernen." },
  { id: 193, question: "Wie erkenne ich die Schonzeit?", beginner: "Lokale Gesetzgebung.", expert: "Immer aktuelle Bestimmungen des Vereins prüfen." },
  { id: 194, question: "Gibt es ein Mindestmaß für Aal?", beginner: "Ja.", expert: "Regionale Vorschriften unbedingt beachten." },
  { id: 195, question: "Wie wichtig ist die Wassertemperatur?", beginner: "Einfluss auf Stoffwechsel.", expert: "Fische werden bei Kälte inaktiv." },
  { id: 196, question: "Was ist eine Feederrute?", beginner: "Spezielle Friedfischrute.", expert: "Mit auswechselbaren Spitzen für Bisserkennung." },
  { id: 197, question: "Wie binde ich ein Wirbel-Vorfach?", beginner: "Grinner-Knoten.", expert: "Robuste Verbindung für schwere Fische." },
  { id: 198, question: "Wie erkenne ich einen Fisch-Biss?", beginner: "Ruckartiger Schnurabzug.", expert: "Bissanzeiger geben akustisches Signal." },
  { id: 199, question: "Was ist die beste Angelzeit im Jahr?", beginner: "Herbst.", expert: "Fische fressen sich für den Winter voll." },
  { id: 200, question: "Wie erkenne ich gute Angelplätze am Ufer?", beginner: "Pflanzenbewuchs.", expert: "Wo viele Pflanzen sind, gibt es Nahrung und Schutz." }
];

export const FISHING_FAQ = faqData;

// Formatierte FAQ für den System-Prompt des KI-Buddy. Nutze diese in ai.js für System-Context.
export const FISHING_FAQ_CONTEXT = `HÄUFIGE FRAGEN & ANTWORTEN (Offline-Wissensbasis):
${faqData.map(faq => `
Frage: ${faq.question}
- Anfänger: ${faq.beginner}
- Profi-Ebene: ${faq.expert}`).join('\n')}

Diese FAQ sind offline lokal gespeichert und helfen dir, schnelle, präzise Antworten zu geben. Nutze sie als Referenz und erkläre die Konzepte in deinen eigenen Worten — du darfst gerne über die gegebenen Antworten hinaus gehen.`;
