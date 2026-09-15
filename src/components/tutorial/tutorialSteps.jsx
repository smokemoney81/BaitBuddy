// App-spezifische Tutorial-Schritte.
// Die Bilder liegen unter public/tutorial/ und werden von der eigenen Domain
// ausgeliefert. Vorher zeigten alle Schritte auf media.base44.com — eine
// externe CDN ausserhalb von Vercel/Supabase, die jederzeit haette wegfallen
// koennen und im WebView ohne Netz gar nicht erst laedt.
// Jeder Schritt referenziert eine konkrete Seite (route) und nennt UI-Elemente,
// die der Nutzer dort wirklich sieht.

export const tutorialSteps = {
  de: [
    {
      title: "Willkommen bei BaitBuddy",
      route: "Home",
      content: "BaitBuddy ist deine Angel-App mit KI-Buddy, Karten, Wetter, Fangbuch und Satellitendaten. Im Tutorial gehen wir Schritt fuer Schritt jede Seite der App durch und zeigen dir, was du dort genau machen kannst.",
      image: "/tutorial/willkommen-bei-baitbuddy.webp"
    },
    {
      title: "Dashboard",
      route: "Dashboard",
      content: "Auf dem Dashboard findest du den blauen Karten-Hinweis 'Entdecke neue Angelplaetze', die KI-Angelempfehlung mit 'Analysieren' (basierend auf Wetter + Fangbuch) und den Schonzeit-Waechter fuer dein Bundesland - hier z.B. Zander in NRW.",
      image: "/tutorial/dashboard.webp"
    },
    {
      title: "Neuen Fang erfassen",
      route: "Logbook",
      content: "Lade ein Foto hoch und tippe auf 'KI Fang-Analyse und automatisch ausfuellen' - die KI erkennt Fischart, Laenge und Gewicht. Mit 'In Community posten' teilst du deinen Fang direkt im Community-Feed.",
      image: "/tutorial/neuen-fang-erfassen.webp"
    },
    {
      title: "Deine Angelkarte",
      route: "Map",
      content: "Die Karte zeigt: blaue Marker fuer deine persoenlichen Spots, gruene Marker fuer Angelvereine und Parks, roter Marker fuer deinen Standort und orange Marker fuer einen neuen Spot zum Speichern. Klicke auf die Karte, um einen neuen Spot zu markieren.",
      image: "/tutorial/deine-angelkarte.webp"
    },
    {
      title: "Wetter und Angelprognose",
      route: "Weather",
      content: "Im Tab 'Aktuell' siehst du Temperatur, Angel-Bedingungen, Luftdruck, Wind mit Boeen, Luftfeuchtigkeit, Sichtweite, Bewoelkung und Taupunkt. Mit 'Standort aktualisieren' holst du die Werte fuer deinen aktuellen GPS-Standort.",
      image: "/tutorial/wetter-und-angelprognose.webp"
    },
    {
      title: "Wetter-Alarme",
      route: "Weather",
      content: "Im Tab 'Alarme' legst du fest, wann du gewarnt werden moechtest: Regen-Warnung ab z.B. 60% Regenwahrscheinlichkeit, Wind-Warnung ab 10 m/s und Sturm-Warnung ab 15 m/s Boeen. Aktiviere die Schalter rechts neben jeder Warnung.",
      image: "/tutorial/wetter-alarme.webp"
    },
    {
      title: "KI Chat-Buddy",
      route: "KiBuddyBeta",
      content: "Der KI-Angel-Buddy hilft mit Fisch-Infos zu Hecht, Zander und Karpfen, Wetter-Tipps, Koeder-Empfehlungen, Spot-Strategien und Timing fuer die besten Tageszeiten. Tippe deine Frage ins Eingabefeld 'Frage an den KI-Buddy'.",
      image: "/tutorial/ki-chat-buddy.webp"
    },
    {
      title: "KI-Kamera und Bissanzeiger",
      route: "AI",
      content: "Die KI-Kamera erkennt Fischarten live im Bild und schaetzt Groesse und Zustand. Der Bissanzeiger nutzt die Kamera, um Bewegung an Pose oder Spitze zu erkennen und gibt einen Alarm.",
      image: "/tutorial/ki-kamera-und-bissanzeiger.webp"
    },
    {
      title: "AR Gewaesser-Ansicht",
      route: "ARView",
      content: "In der AR-Ansicht legst du eine 3D-Tiefenkarte deines Gewaessers ueber das Kamerabild. Bewegungssensoren zeigen dir Strukturen und Hotspots in deiner Umgebung.",
      image: "/tutorial/ar-gewaesser-ansicht.webp"
    },
    {
      title: "Satelliten-Gewaesseranalyse",
      route: "WaterAnalysis",
      content: "Gemessene Wetter- und Wasserwerte fuer deinen Standort aus dem Open-Meteo-Modell. Tippe auf 'Standort' fuer GPS und auf 'Analyse', um Wassertemperatur, Luftdruck, Wind und Wellenhoehe abzurufen. Die Bewertung darunter zeigt, wie sie zustande kommt.",
      image: "/tutorial/satelliten-gewaesseranalyse.webp"
    },
    {
      title: "Koeder-Mischer",
      route: "BaitMixer",
      content: "Im Koeder-Mischer kombinierst du Zutaten und siehst die Attraktivitaet je Fischart in Prozent. Speichere deine Rezepte, bewerte sie nach dem Einsatz und teile sie mit der Community.",
      image: "/tutorial/koeder-mischer.webp"
    },
    {
      title: "Ausruestung",
      route: "Gear",
      content: "Verwalte Ruten, Rollen, Schnuere und Haken in eigenen Setups. Lege Setups fuer Hecht, Karpfen oder Spinnfischen an und ruf sie beim Trip-Planen direkt auf.",
      image: "/tutorial/ausruestung.webp"
    },
    {
      title: "Trip-Planer",
      route: "TripPlanner",
      content: "Im Trip-Planer bekommst du Schnur-Tipp, Haken-Tipp und weitere Hinweise je Zielfisch. Mit dem KI-Buddy Setup-Check wird dein Setup geprueft, mit 'In meinen Plan speichern' uebernimmst du es als aktiven Trip.",
      image: "/tutorial/trip-planer.webp"
    },
    {
      title: "Community",
      route: "Community",
      content: "In der Community teilst du Posts und Faenge, kommentierst, gibst Likes und nimmst an Wettbewerben teil. Ueber den Chat-Bereich tauschst du dich live mit anderen Anglern aus.",
      image: "/tutorial/community.webp"
    },
    {
      title: "Ranking",
      route: "Rank",
      content: "Im Ranking siehst du dich im Vergleich zu anderen Anglern - taeglich, woechentlich, monatlich und gesamt. Punkte bekommst du fuer Faenge, Quiz-Antworten und Community-Aktivitaet.",
      image: "/tutorial/ranking.webp"
    },
    {
      title: "Regeln und Schonzeiten",
      route: "AngelscheinPruefungSchonzeiten",
      content: "Hier pruefst du Mindestmasse und Schonzeiten je Bundesland. Ein roter Warner auf dem Dashboard zeigt aktive Schonzeiten in deiner Region direkt an.",
      image: "/tutorial/regeln-und-schonzeiten.webp"
    },
    {
      title: "Angelschein-Pruefung",
      route: "Quiz",
      content: "Bereite dich optimal auf die Fischerpruefung vor. Waehle dein Bundesland, starte die Pruefungssimulation und uebe mit Original-Fragen aus Allgemein, Geraetekunde, Gewaesserkunde und Gesetzeskunde.",
      image: "/tutorial/angelschein-pruefung.webp"
    },
    {
      title: "Lizenzen",
      route: "Licenses",
      content: "Lade Fotos deiner Angelscheine und Gewaesserkarten hoch, hinterlege das Ablaufdatum und du wirst rechtzeitig erinnert. Alles ist auch offline verfuegbar.",
      image: "/tutorial/lizenzen.webp"
    },
    {
      title: "Geraete-Integration",
      route: "Devices",
      content: "Verbinde Bissanzeiger, Echolote oder Smartwatches. Du siehst Akkustand und Signal, bekommst Push-Benachrichtigungen bei Bissen und kannst Echolot-Daten in der App auswerten.",
      image: "/tutorial/geraete-integration.webp"
    },
    {
      title: "Arcade-Spiele",
      route: "Match3Game",
      content: "Zwischen den Sessions kannst du in der Arcade kleine Spiele wie Precision Cast, Match-3 oder Bite Timing spielen, Highscores sammeln und Achievements freischalten.",
      image: "/tutorial/arcade-spiele.webp"
    },
    {
      title: "Premium-Plaene",
      route: "PremiumPlans",
      content: "Auf der Premium-Seite siehst du Free, Basic, Pro und Ultimate. Premium schaltet KI-Funktionen, Satellitendaten und erweiterte Karten frei. Drei Tage kostenlos testen.",
      image: "/tutorial/premium-plaene.webp"
    },
    {
      title: "Einstellungen",
      route: "Settings",
      content: "In den Einstellungen waehlst du Sprache, Einheiten, Theme, Stimme, Sound und Wetter-Alarme. Hier aktivierst du auch die Vorlesefunktion fuer den KI-Buddy.",
      image: "/tutorial/einstellungen.webp"
    },
    {
      title: "PWA und Offline",
      route: "Dashboard",
      content: "Installiere BaitBuddy als App ueber den Install-Button. Spots, Wetter, Lizenzen und Regeln sind dann auch ohne Internet verfuegbar und werden automatisch synchronisiert.",
      image: "/tutorial/pwa-und-offline.webp"
    },
    {
      title: "Profil",
      route: "Profile",
      content: "Auf deinem Profil siehst du deinen Avatar, Mitglied seit Datum, Gesamtfaenge, groessten Fisch, Anzahl Arten und Punkte. Achievement-Badges zeigen freigeschaltete Erfolge an.",
      image: "/tutorial/profil.webp"
    },
    {
      title: "Fang-Statistiken",
      route: "CatchStats",
      content: "Detaillierte Statistiken zu deinen Faengen: Faenge pro Monat, Fischart-Verteilung, groesste Faenge im Zeitverlauf und Durchschnittsgroessen. Hilft dir, Muster zu erkennen.",
      image: "/tutorial/fang-statistiken.webp"
    },
    {
      title: "Events",
      route: "Events",
      content: "Auf der Events-Seite findest du aktuelle Turniere und Aktionen mit Preisen und Countdown. Mit einem Tipp meldest du dich an und siehst die Teilnehmerzahl.",
      image: "/tutorial/events.webp"
    },
    {
      title: "Foto-Voting",
      route: "Community",
      content: "Beim Community-Voting bewertest du Fang-Fotos anderer Angler per Like-Button. Die Top-Fotos kommen ins Leaderboard und gewinnen am Ende des Zeitraums.",
      image: "/tutorial/foto-voting.webp"
    },
    {
      title: "Clans",
      route: "Community",
      content: "Erstelle einen Clan oder tritt einem bei. Mitglieder sammeln gemeinsam Punkte fuer das Clan-Leaderboard. Im Clan-Bereich siehst du Mitglieder, Beitraege und kannst neue einladen.",
      image: "/tutorial/clans.webp"
    },
    {
      title: "Tiefenkarten-Crowdsourcing",
      route: "BathymetricCrowdsourcing",
      content: "Lade deine Echolot-Daten hoch und hilf, eine genaue Tiefenkarte deines Gewaessers zu bauen. Die App rechnet alle Beitraege zu einer Heatmap zusammen.",
      image: "/tutorial/tiefenkarten-crowdsourcing.webp"
    },
    {
      title: "AR Knoten-Assistent",
      route: "ARKnotenAssistent",
      content: "Lerne Anglerknoten Schritt fuer Schritt. Waehle Palomar, Clinch oder Uni-Knoten und folge den Anweisungen wie 'Schnur verdoppeln - Falte ca. 20cm der Schnur und fuehre die Schlaufe durch das Oehr'. Mit Mikrofon kannst du dich vorlesen lassen.",
      image: "/tutorial/ar-knoten-assistent.webp"
    },
    {
      title: "Gebrauchte Ausruestung",
      route: "UsedGear",
      content: "Im Marktplatz kaufst und verkaufst du gebrauchte Angel-Ausruestung. Filter nach Kategorie, Zustand und Standort. Kontakt zum Verkaeufer direkt aus der App.",
      image: "/tutorial/gebrauchte-ausruestung.webp"
    },
    {
      title: "Shop",
      route: "Shop",
      content: "Im Shop findest du empfohlene Angel-Produkte mit Bewertungen und Direkt-Links zu Partnern. Filtere nach Kategorie wie Ruten, Rollen, Koeder oder Zubehoer.",
      image: "/tutorial/shop.webp"
    },
    {
      title: "Funktion-Bewertungen",
      route: "FunctionRatings",
      content: "Bewerte einzelne Features der App mit Sternen und einem Kommentar. Dein Feedback hilft uns, BaitBuddy gezielt zu verbessern.",
      image: "/tutorial/funktion-bewertungen.webp"
    },
    {
      title: "Viel Erfolg",
      route: "Dashboard",
      content: "Du kennst jetzt jede wichtige Seite der App. Starte am besten mit dem Dashboard, logge deinen ersten Fang und probier den KI-Buddy aus. Petri Heil und tight lines.",
      image: "/tutorial/viel-erfolg.webp"
    }
  ],
  en: [
    {
      title: "Welcome to BaitBuddy",
      route: "Home",
      content: "BaitBuddy is your fishing app with AI buddy, maps, weather, logbook and satellite data. This tutorial walks you through every page step by step and shows what you can do there.",
      image: "/tutorial/willkommen-bei-baitbuddy.webp"
    },
    {
      title: "Dashboard",
      route: "Dashboard",
      content: "The dashboard has the blue map hint 'Discover new fishing spots', the AI fishing recommendation with 'Analyze' (based on weather + logbook) and the closed-season watcher for your region - here Zander in NRW.",
      image: "/tutorial/dashboard.webp"
    },
    {
      title: "Log a New Catch",
      route: "Logbook",
      content: "Upload a photo and tap 'AI catch analysis and auto fill' - the AI detects species, length and weight. Use 'Post to community' to share your catch in the community feed instantly.",
      image: "/tutorial/neuen-fang-erfassen.webp"
    },
    {
      title: "Your Fishing Map",
      route: "Map",
      content: "The map shows: blue markers for your personal spots, green markers for fishing clubs and parks, red marker for your current location and orange marker for a new spot to save. Click on the map to mark a new spot.",
      image: "/tutorial/deine-angelkarte.webp"
    },
    {
      title: "Weather and Fishing Forecast",
      route: "Weather",
      content: "The 'Current' tab shows temperature, fishing conditions, pressure, wind with gusts, humidity, visibility, cloud cover and dew point. Tap 'Update location' to refresh values for your GPS position.",
      image: "/tutorial/wetter-und-angelprognose.webp"
    },
    {
      title: "Weather Alerts",
      route: "Weather",
      content: "In the 'Alerts' tab you set when to be warned: rain alert from e.g. 60% rain probability, wind alert from 10 m/s and storm alert from 15 m/s gusts. Toggle the switches on the right of each alert.",
      image: "/tutorial/wetter-alarme.webp"
    },
    {
      title: "AI Chat Buddy",
      route: "KiBuddyBeta",
      content: "The AI fishing buddy helps with fish info on pike, zander and carp, weather tips, bait recommendations, spot strategies and timing for the best hours. Type your question in the 'Ask the AI Buddy' field.",
      image: "/tutorial/ki-chat-buddy.webp"
    },
    {
      title: "AI Camera and Bite Detector",
      route: "AI",
      content: "The AI camera recognizes species live and estimates size and condition. The bite detector uses the camera to detect motion of float or rod tip and alerts you.",
      image: "/tutorial/ki-kamera-und-bissanzeiger.webp"
    },
    {
      title: "AR Water View",
      route: "ARView",
      content: "In the AR view a 3D depth map of your water is overlaid on the camera image. Motion sensors reveal structures and hotspots in your surroundings.",
      image: "/tutorial/ar-gewaesser-ansicht.webp"
    },
    {
      title: "Satellite Water Analysis",
      route: "WaterAnalysis",
      content: "Measured weather and water values for your location from the Open-Meteo model. Tap 'Location' for GPS and 'Analyze' to retrieve water temperature, air pressure, wind and wave height. The rating below shows how it is derived.",
      image: "/tutorial/satelliten-gewaesseranalyse.webp"
    },
    {
      title: "Bait Mixer",
      route: "BaitMixer",
      content: "In the bait mixer you combine ingredients and see attractiveness per species in percent. Save recipes, rate them after use and share them with the community.",
      image: "/tutorial/koeder-mischer.webp"
    },
    {
      title: "Gear",
      route: "Gear",
      content: "Manage rods, reels, lines and hooks in setups. Create setups for pike, carp or spinning and load them when planning a trip.",
      image: "/tutorial/ausruestung.webp"
    },
    {
      title: "Trip Planner",
      route: "TripPlanner",
      content: "The trip planner shows line tip, hook tip and more notes per target fish. Use the AI Buddy Setup-Check to verify your setup and 'Save to my plan' to make it your active trip.",
      image: "/tutorial/trip-planer.webp"
    },
    {
      title: "Community",
      route: "Community",
      content: "In the community you share posts and catches, comment, like and join contests. The chat area lets you talk live with other anglers.",
      image: "/tutorial/community.webp"
    },
    {
      title: "Ranking",
      route: "Rank",
      content: "Ranking compares you to other anglers - daily, weekly, monthly and total. You earn points for catches, quiz answers and community activity.",
      image: "/tutorial/ranking.webp"
    },
    {
      title: "Rules and Closed Seasons",
      route: "AngelscheinPruefungSchonzeiten",
      content: "Check minimum sizes and closed seasons by region. A red warner on the dashboard shows active closed seasons in your region.",
      image: "/tutorial/regeln-und-schonzeiten.webp"
    },
    {
      title: "License Exam",
      route: "Quiz",
      content: "Prepare for the fishing license exam. Pick your region, start the exam simulation and practice with original questions on general, tackle, water and law topics.",
      image: "/tutorial/angelschein-pruefung.webp"
    },
    {
      title: "Licenses",
      route: "Licenses",
      content: "Upload photos of fishing licenses and permits, set the expiration date and get reminders. Everything stays available offline.",
      image: "/tutorial/lizenzen.webp"
    },
    {
      title: "Devices",
      route: "Devices",
      content: "Connect bite alarms, fish finders or smartwatches. See battery and signal, get push alerts on bites and analyze fish finder data in the app.",
      image: "/tutorial/geraete-integration.webp"
    },
    {
      title: "Arcade Games",
      route: "Match3Game",
      content: "Between sessions play small games like Precision Cast, Match-3 or Bite Timing in the arcade, collect high scores and unlock achievements.",
      image: "/tutorial/arcade-spiele.webp"
    },
    {
      title: "Premium Plans",
      route: "PremiumPlans",
      content: "On the premium page you see Free, Basic, Pro and Ultimate. Premium unlocks AI features, satellite data and extended maps. Three day free trial.",
      image: "/tutorial/premium-plaene.webp"
    },
    {
      title: "Settings",
      route: "Settings",
      content: "In settings you choose language, units, theme, voice, sound and weather alerts. This is also where you enable text-to-speech for the AI buddy.",
      image: "/tutorial/einstellungen.webp"
    },
    {
      title: "PWA and Offline",
      route: "Dashboard",
      content: "Install BaitBuddy as an app via the install button. Spots, weather, licenses and rules then work without internet and sync automatically.",
      image: "/tutorial/pwa-und-offline.webp"
    },
    {
      title: "Profile",
      route: "Profile",
      content: "On your profile you see your avatar, member-since date, total catches, biggest fish, species count and points. Achievement badges show your unlocked milestones.",
      image: "/tutorial/profil.webp"
    },
    {
      title: "Catch Statistics",
      route: "CatchStats",
      content: "Detailed statistics about your catches: catches per month, species distribution, biggest catches over time and average sizes. Helps you spot patterns.",
      image: "/tutorial/fang-statistiken.webp"
    },
    {
      title: "Events",
      route: "Events",
      content: "On the events page you find current tournaments and actions with prizes and countdown. Tap to register and see how many anglers joined.",
      image: "/tutorial/events.webp"
    },
    {
      title: "Photo Voting",
      route: "Community",
      content: "In community voting you rate other anglers' catch photos with the like button. Top photos enter the leaderboard and win at the end of the period.",
      image: "/tutorial/foto-voting.webp"
    },
    {
      title: "Clans",
      route: "Community",
      content: "Create a clan or join one. Members collect points together for the clan leaderboard. Inside the clan area you see members, contributions and can invite new ones.",
      image: "/tutorial/clans.webp"
    },
    {
      title: "Bathymetric Crowdsourcing",
      route: "BathymetricCrowdsourcing",
      content: "Upload your fish finder data and help build an accurate depth map of your water. The app combines all contributions into a heatmap.",
      image: "/tutorial/tiefenkarten-crowdsourcing.webp"
    },
    {
      title: "AR Knot Assistant",
      route: "ARKnotenAssistent",
      content: "Learn fishing knots step by step. Choose Palomar, Clinch or Uni knot, follow instructions like 'Double the line - fold ~20cm and pass the loop through the eye'. Tap microphone to hear it read aloud.",
      image: "/tutorial/ar-knoten-assistent.webp"
    },
    {
      title: "Used Gear",
      route: "UsedGear",
      content: "In the marketplace you buy and sell used fishing gear. Filter by category, condition and location. Contact the seller directly from the app.",
      image: "/tutorial/gebrauchte-ausruestung.webp"
    },
    {
      title: "Shop",
      route: "Shop",
      content: "The shop lists recommended fishing products with ratings and direct links to partners. Filter by category like rods, reels, baits or accessories.",
      image: "/tutorial/shop.webp"
    },
    {
      title: "Feature Ratings",
      route: "FunctionRatings",
      content: "Rate individual app features with stars and a comment. Your feedback helps us improve BaitBuddy where it matters most.",
      image: "/tutorial/funktion-bewertungen.webp"
    },
    {
      title: "Good Luck",
      route: "Dashboard",
      content: "You now know every key page of the app. Start on the dashboard, log your first catch and try the AI buddy. Tight lines.",
      image: "/tutorial/viel-erfolg.webp"
    }
  ]
};

export default tutorialSteps;