import {
  Home, Map, Brain, Mic, CloudSun, BookOpen, CalendarDays, Users, Trophy, Backpack,
  User, Settings, Crown, BarChart3, GraduationCap, LifeBuoy, Fish, Compass, Camera,
  Bell, Download, ScrollText, ShoppingBag, Smartphone, Sparkles, Waves, Satellite, ChefHat, ShieldCheck,
} from 'lucide-react';

// Anzeigename + Icon je Route. Grundlage für Seitentitel, "Zuletzt verwendet"
// im Command Center und die Kopfzeile.
export const PAGE_META = {
  Dashboard: { title: 'Home', icon: Home },
  Map: { title: 'Karte', icon: Map },
  KiBuddyBeta: { title: 'KI-Buddy', icon: Brain },
  VoiceChat: { title: 'Voice-Buddy', icon: Mic },
  Weather: { title: 'Wetter', icon: CloudSun },
  Logbook: { title: 'Fangbuch', icon: BookOpen },
  CatchStats: { title: 'Statistiken', icon: BarChart3 },
  TripPlanner: { title: 'Trips & Planung', icon: CalendarDays },
  AnglerMode: { title: 'Anglermodus', icon: Compass },
  LiveTrip: { title: 'Live-Trip', icon: Compass },
  Community: { title: 'Community', icon: Users },
  Events: { title: 'Events', icon: Trophy },
  Rank: { title: 'Ranglisten', icon: Trophy },
  Gear: { title: 'Ausrüstung', icon: Backpack },
  MyDevices: { title: 'Meine Geräte', icon: Smartphone },
  Shop: { title: 'Shop', icon: ShoppingBag },
  Profile: { title: 'Profil', icon: User },
  Settings: { title: 'Einstellungen', icon: Settings },
  PremiumPlans: { title: 'Tarif & KI-Zugriff', icon: Crown },
  BuddyKnowsYou: { title: 'BaitBuddy kennt dich', icon: Sparkles },
  AI: { title: 'Fischbestimmung & Biss', icon: Camera },
  CatchCam: { title: 'CatchCam', icon: Camera },
  WaterAnalysis: { title: 'Gewässeranalyse', icon: Waves },
  SatelliteAnalysis: { title: 'Satellitenanalyse', icon: Satellite },
  BaitMixer: { title: 'Köderempfehlung', icon: Fish },
  Koeder3D: { title: 'Köderführung 3D', icon: Fish },
  FishRecipes: { title: 'Fischrezepte', icon: ChefHat },
  AngelscheinPruefungSchonzeiten: { title: 'Angelschein & Schonzeiten', icon: GraduationCap },
  RuleAssistant: { title: 'Regel-Assistent', icon: ScrollText },
  Quiz: { title: 'Quiz', icon: GraduationCap },
  Tutorials: { title: 'Anleitungen', icon: GraduationCap },
  Help: { title: 'Hilfe', icon: LifeBuoy },
  NotificationCenter: { title: 'Benachrichtigungen', icon: Bell },
  OfflineFishingPack: { title: 'Offline-Paket', icon: Download },
  Privatsphaere: { title: 'Privatsphäre', icon: ShieldCheck },
  HandsFreeBuddy: { title: 'Hands-free Buddy', icon: Mic },
};

const RECENT_KEY = 'bb_recent_pages';
const RECENT_MAX = 6;
const NOT_RECORDED = new Set(['Dashboard', 'Home']);

export function readRecentPages() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(page => PAGE_META[page]) : [];
  } catch {
    return [];
  }
}

export function recordRecentPage(page) {
  if (!PAGE_META[page] || NOT_RECORDED.has(page)) return;
  try {
    const next = [page, ...readRecentPages().filter(entry => entry !== page)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Ohne localStorage bleibt die Liste einfach leer.
  }
}
