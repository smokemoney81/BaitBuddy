import { Home, Map, Brain, Cloud, BookOpen, Calendar, Users, Wrench, User, Zap } from 'lucide-react';
export const navigationItems = {
  Dashboard: { name: 'Home', icon: Home }, Map: { name: 'Karte', icon: Map },
  KiBuddyBeta: { name: 'KI-Buddy', icon: Brain }, Weather: { name: 'Wetter', icon: Cloud },
  Logbook: { name: 'Fangbuch', icon: BookOpen }, TripPlanner: { name: 'Planung', icon: Calendar },
  Community: { name: 'Community', icon: Users }, Gear: { name: 'Ausrüstung', icon: Wrench }, Profile: { name: 'Profil', icon: User },
  PremiumPlans: { name: 'Premium', icon: Zap },
};
export const navigationGroups = [
  { name: 'KI-Tools', items: [['KI-Buddy', 'KiBuddyBeta'], ['Voice-Buddy', 'VoiceChat'], ['Fischbestimmung & Biss', 'AI'], ['Fang-Analyse', 'Analysis'], ['Gewässeranalyse', 'WaterAnalysis'], ['Köderempfehlung', 'BaitMixer'], ['3D-Köderführung', 'Koeder3D'], ['AR-Gewässer', 'ARView'], ['AR Knoten AI', 'ARKnotenAssistent']] },
  { name: 'Karte & Spots', items: [['Karte, Gewässer & Favoriten', 'Map'], ['Offline-Karten', 'Settings?tab=general']] },
  { name: 'Wetter & Prognosen', items: [['Wetter, Bissprognose & Solunar', 'Weather']] },
  { name: 'Fangbuch', items: [['Meine Fänge', 'Logbook'], ['Statistiken & Rekorde', 'CatchStats']] },
  { name: 'Planung', items: [['Ausflüge & gespeicherte Touren', 'TripPlanner'], ['Neuer Ausflug', 'TripPlanner?new=1'], ['Live-Trip', 'LiveTripPage']] },
  { name: 'Ausrüstung', items: [['Equipment, Sets & Köder', 'Gear'], ['Meine Geräte', 'MyDevices'], ['Shop', 'Shop']] },
  { name: 'Community', items: [['Feed, Gruppen & Freunde', 'Community'], ['Events', 'Events'], ['Ranglisten', 'Rank']] },
  { name: 'Wissen & Angelschein', items: [['Prüfung & Schonzeiten', 'AngelscheinPruefungSchonzeiten'], ['Quiz', 'Quiz'], ['Lizenzen', 'Licenses'], ['Anleitungen', 'Tutorials']] },
  { name: 'Einstellungen', items: [['Profil', 'Profile'], ['KI-Buddy', 'Settings?tab=buddy'], ['Navigation', 'Settings?tab=navigation'], ['Benachrichtigungen', 'Settings?tab=notifications'], ['Darstellung', 'Settings?tab=appearance'], ['Audio & Stimme', 'Settings?tab=voice'], ['Akku, Datenschutz & Konto', 'Settings'], ['Premium', 'PremiumPlans']] },
  { name: 'Rechtliches & Support', items: [['Hilfe, FAQ & Support', 'Help'], ['Datenschutz', 'Datenschutz'], ['Impressum', 'Impressum'], ['AGB', 'AGB']] },
];
