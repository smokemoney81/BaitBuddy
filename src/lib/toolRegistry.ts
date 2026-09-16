/**
 * Central Tool Registry System
 *
 * Single source of truth for all fishing tools available in the app.
 * Replaces scattered navigationItems, navigationGroups, and entitlement checks
 * with a unified, queryable registry.
 *
 * Each tool is defined with:
 * - id: unique identifier (must match route)
 * - name: display name (German)
 * - description: brief description for help/onboarding
 * - route: React Router path (e.g., '/Dashboard', '/KiBuddyBeta')
 * - category: tool category for grouping and discovery
 * - icon: lucide-react icon component name
 * - requires: minimum plan level required ('free', 'basic', 'pro', 'elite')
 * - offline: offline support level ('NONE', 'PARTIAL', 'FULL')
 * - beta: whether tool is still in beta
 * - tags: searchable keywords (e.g., 'ai', 'voice', 'location')
 */

export type ToolCategory =
  | 'ai'
  | 'map'
  | 'weather'
  | 'logbook'
  | 'planning'
  | 'gear'
  | 'community'
  | 'knowledge'
  | 'settings'
  | 'legal';

export type PlanLevel = 'free' | 'basic' | 'pro' | 'elite' | 'ultimate' | 'friends';

export type OfflineSupport = 'NONE' | 'PARTIAL' | 'FULL';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  route: string;
  category: ToolCategory;
  icon: string;
  requires: PlanLevel;
  offline: OfflineSupport;
  beta?: boolean;
  tags?: string[];
  helpUrl?: string;
  releaseDate?: string;
}

export const TOOLS: ToolDefinition[] = [
  // === AI Tools ===
  {
    id: 'ki-buddy',
    name: 'KI-Buddy',
    description: 'Dein persönlicher Angel-Assistent mit AI-gestützter Beratung',
    route: '/KiBuddyBeta',
    category: 'ai',
    icon: 'Brain',
    requires: 'free',
    offline: 'PARTIAL',
    tags: ['chat', 'ai', 'beratung', 'coaching'],
    releaseDate: '2024-01-01',
  },
  {
    id: 'voice-buddy',
    name: 'Voice-Buddy',
    description: 'Sprach-gesteuerte Angel-Beratung während des Angelns',
    route: '/VoiceChat',
    category: 'ai',
    icon: 'Mic',
    requires: 'basic',
    offline: 'NONE',
    beta: true,
    tags: ['voice', 'streaming', 'hands-free'],
  },
  {
    id: 'fish-identification',
    name: 'Fischbestimmung & Biss',
    description: 'Bestimme Fischarten und erhalte Bisserkennungs-Tipps per AI-Vision',
    route: '/AI',
    category: 'ai',
    icon: 'Eye',
    requires: 'basic',
    offline: 'PARTIAL',
    beta: true,
    tags: ['vision', 'erkennung', 'fotos'],
  },
  {
    id: 'catch-analysis',
    name: 'Fang-Analyse',
    description: 'AI-gestützte Analyse deiner Fänge und Erfolgs-Tipps',
    route: '/Analysis',
    category: 'ai',
    icon: 'BarChart3',
    requires: 'pro',
    offline: 'PARTIAL',
    tags: ['statistik', 'ai', 'muster'],
  },
  {
    id: 'water-analysis',
    name: 'Gewässeranalyse',
    description: 'AI analysiert Gewässereigenschaften und gibt Köder-Empfehlungen',
    route: '/WaterAnalysis',
    category: 'ai',
    icon: 'Droplet',
    requires: 'pro',
    offline: 'PARTIAL',
    beta: true,
    tags: ['gewässer', 'ai', 'analyse'],
  },
  {
    id: 'bait-mixer',
    name: 'Köderempfehlung',
    description: 'Finde den perfekten Köder für dein Zielgewässer und -fische',
    route: '/BaitMixer',
    category: 'ai',
    icon: 'Wand2',
    requires: 'basic',
    offline: 'FULL',
    tags: ['köder', 'empfehlung', 'fische'],
  },
  {
    id: 'lure-3d',
    name: '3D-Köderführung',
    description: 'Visualisiere realistische Köder-Bewegungen und Führungsstile',
    route: '/Koeder3D',
    category: 'ai',
    icon: 'Cube',
    requires: 'pro',
    offline: 'FULL',
    beta: true,
    tags: ['animation', '3d', 'köder', 'technik'],
  },
  {
    id: 'ar-water',
    name: 'AR-Gewässer',
    description: 'Augmented Reality Ansicht des Gewässers mit Fischfluss-Vorhersage',
    route: '/ARView',
    category: 'ai',
    icon: 'Eye',
    requires: 'elite',
    offline: 'NONE',
    beta: true,
    tags: ['ar', 'augmented-reality', 'gewässer'],
  },
  {
    id: 'ar-knots',
    name: 'AR Knoten AI',
    description: 'Lerne Angel-Knoten mit AR-Anleitung und AI-Coaching',
    route: '/ARKnotenAssistent',
    category: 'ai',
    icon: 'Link2',
    requires: 'pro',
    offline: 'PARTIAL',
    beta: true,
    tags: ['knoten', 'ar', 'anleitung'],
  },

  // === Map & Locations ===
  {
    id: 'map',
    name: 'Karte',
    description: 'Interaktive Karte mit Spots, Gewässern und deinen Fängen',
    route: '/Map',
    category: 'map',
    icon: 'MapPin',
    requires: 'free',
    offline: 'PARTIAL',
    tags: ['navigation', 'orte', 'gps'],
  },
  {
    id: 'offline-maps',
    name: 'Offline-Karten',
    description: 'Lade Karten herunter für Offline-Nutzung',
    route: '/Settings?tab=general',
    category: 'map',
    icon: 'Download',
    requires: 'basic',
    offline: 'FULL',
    tags: ['offline', 'karten'],
  },

  // === Weather & Forecasts ===
  {
    id: 'weather',
    name: 'Wetter',
    description: 'Wetter, Bissprognose & Solunar-Zeiten für dein Gewässer',
    route: '/Weather',
    category: 'weather',
    icon: 'Cloud',
    requires: 'free',
    offline: 'PARTIAL',
    tags: ['wetter', 'prognose', 'solunar', 'mondphasen'],
  },

  // === Logbook ===
  {
    id: 'catches',
    name: 'Meine Fänge',
    description: 'Protokolliere deine Fänge mit Fotos, Gewicht und Gewässer',
    route: '/Logbook',
    category: 'logbook',
    icon: 'BookOpen',
    requires: 'free',
    offline: 'FULL',
    tags: ['fangbuch', 'erfolg', 'fische'],
  },
  {
    id: 'catch-stats',
    name: 'Statistiken & Rekorde',
    description: 'Sehe deine Angel-Statistiken, Rekorde und Trends',
    route: '/CatchStats',
    category: 'logbook',
    icon: 'BarChart3',
    requires: 'free',
    offline: 'PARTIAL',
    tags: ['statistik', 'trend', 'erfolg'],
  },

  // === Planning ===
  {
    id: 'trips',
    name: 'Ausflüge',
    description: 'Plane Angel-Ausflüge mit Datum, Gewässer und Ausrüstung',
    route: '/TripPlanner',
    category: 'planning',
    icon: 'Calendar',
    requires: 'free',
    offline: 'FULL',
    tags: ['planung', 'ausflug', 'tour'],
  },
  {
    id: 'live-trip',
    name: 'Live-Trip',
    description: 'Aktiver Angel-Ausflug mit Live-Tracking und Real-Time-Coaching',
    route: '/LiveTripPage',
    category: 'planning',
    icon: 'Zap',
    requires: 'free',
    offline: 'PARTIAL',
    tags: ['live', 'tracking', 'gps'],
  },
  {
    id: 'angler-mode',
    name: 'Angler-Modus',
    description: 'Optimierte UI während des aktiven Angelns (großeTargets, einhändig)',
    route: '/AnglerMode',
    category: 'planning',
    icon: 'Maximize2',
    requires: 'free',
    offline: 'FULL',
    beta: true,
    tags: ['ui', 'modus', 'active-fishing'],
  },

  // === Gear & Equipment ===
  {
    id: 'gear',
    name: 'Ausrüstung',
    description: 'Verwalte Angel-Sets, Köder, Ruten, Rollen und Zubehör',
    route: '/Gear',
    category: 'gear',
    icon: 'Wrench',
    requires: 'free',
    offline: 'FULL',
    tags: ['equipment', 'sets', 'köder'],
  },
  {
    id: 'devices',
    name: 'Geräte verbinden',
    description: 'Verbinde smarte Geräte: Herzfrequenzmesser, Waagen, Echolote',
    route: '/Devices',
    category: 'gear',
    icon: 'Bluetooth',
    requires: 'basic',
    offline: 'PARTIAL',
    beta: true,
    tags: ['bluetooth', 'ble', 'hardware'],
  },
  {
    id: 'shop',
    name: 'Shop',
    description: 'Empfohlendes Equipment und Köder direkt kaufen',
    route: '/Shop',
    category: 'gear',
    icon: 'ShoppingCart',
    requires: 'free',
    offline: 'NONE',
    tags: ['shop', 'kaufen', 'e-commerce'],
  },

  // === Community ===
  {
    id: 'community',
    name: 'Community',
    description: 'Feed, Gruppen und Freunde folgen',
    route: '/Community',
    category: 'community',
    icon: 'Users',
    requires: 'free',
    offline: 'PARTIAL',
    tags: ['sozial', 'freunde', 'feed'],
  },
  {
    id: 'events',
    name: 'Events',
    description: 'Besuche Angel-Events, Wettbewerbe und Gruppenaktionen',
    route: '/Events',
    category: 'community',
    icon: 'Trophy',
    requires: 'free',
    offline: 'PARTIAL',
    tags: ['wettbewerb', 'event', 'gruppe'],
  },
  {
    id: 'rankings',
    name: 'Ranglisten',
    description: 'Vergleiche dich mit anderen Anglern in Ranglisten',
    route: '/Rank',
    category: 'community',
    icon: 'Zap',
    requires: 'free',
    offline: 'PARTIAL',
    tags: ['leaderboard', 'vergleich', 'erfolg'],
  },

  // === Knowledge ===
  {
    id: 'exam',
    name: 'Angelschein & Schonzeiten',
    description: 'Lerne für die Angelschein-Prüfung und kenne Schonzeiten',
    route: '/AngelscheinPruefungSchonzeiten',
    category: 'knowledge',
    icon: 'BookMarked',
    requires: 'free',
    offline: 'FULL',
    tags: ['ausbildung', 'lizenz', 'gesetze'],
  },
  {
    id: 'quiz',
    name: 'Quiz',
    description: 'Teste dein Angel-Wissen mit interaktiven Quizzen',
    route: '/Quiz',
    category: 'knowledge',
    icon: 'HelpCircle',
    requires: 'free',
    offline: 'FULL',
    beta: true,
    tags: ['lernen', 'wissen', 'quiz'],
  },
  {
    id: 'licenses',
    name: 'Lizenzen',
    description: 'Verwalte deine Angel-Lizenzen und Genehmigungen',
    route: '/Licenses',
    category: 'knowledge',
    icon: 'Award',
    requires: 'free',
    offline: 'FULL',
    tags: ['lizenz', 'dokumente'],
  },
  {
    id: 'tutorials',
    name: 'Anleitungen',
    description: 'Schritt-für-Schritt Anleitungen zu Techniken und Knoten',
    route: '/Tutorials',
    category: 'knowledge',
    icon: 'BookOpen',
    requires: 'free',
    offline: 'FULL',
    tags: ['anleitung', 'lernen', 'how-to'],
  },

  // === Settings ===
  {
    id: 'profile',
    name: 'Profil',
    description: 'Dein Benutzerprofil und persönliche Informationen',
    route: '/Profile',
    category: 'settings',
    icon: 'User',
    requires: 'free',
    offline: 'FULL',
    tags: ['konto', 'einstellungen'],
  },
  {
    id: 'buddy-settings',
    name: 'KI-Buddy Einstellungen',
    description: 'Passe KI-Buddy Verhalten, Stimme und Stil an',
    route: '/Settings?tab=buddy',
    category: 'settings',
    icon: 'Settings',
    requires: 'free',
    offline: 'FULL',
    tags: ['konfiguration', 'ai'],
  },
  {
    id: 'navigation-settings',
    name: 'Navigation',
    description: 'Passe die App-Navigation und Reiter-Sichtbarkeit an',
    route: '/Settings?tab=navigation',
    category: 'settings',
    icon: 'BarChart3',
    requires: 'free',
    offline: 'FULL',
    tags: ['ui', 'layout'],
  },
  {
    id: 'notification-settings',
    name: 'Benachrichtigungen',
    description: 'Verwalte Push-Benachrichtigungen und Alarme',
    route: '/Settings?tab=notifications',
    category: 'settings',
    icon: 'Bell',
    requires: 'free',
    offline: 'FULL',
    tags: ['notifications', 'alerts'],
  },
  {
    id: 'appearance-settings',
    name: 'Darstellung',
    description: 'Dark Mode, Sprache, Schriftgröße und UI-Design',
    route: '/Settings?tab=appearance',
    category: 'settings',
    icon: 'Palette',
    requires: 'free',
    offline: 'FULL',
    tags: ['theme', 'ui', 'sprache'],
  },
  {
    id: 'voice-settings',
    name: 'Audio & Stimme',
    description: 'KI-Buddy Stimme, TTS-Modell und Audio-Einstellungen',
    route: '/Settings?tab=voice',
    category: 'settings',
    icon: 'Volume2',
    requires: 'free',
    offline: 'FULL',
    tags: ['audio', 'tts', 'stimme'],
  },
  {
    id: 'account-settings',
    name: 'Akku, Datenschutz & Konto',
    description: 'Datenschutz, Batterie-Optimierung und Konto-Verwaltung',
    route: '/Settings',
    category: 'settings',
    icon: 'Settings',
    requires: 'free',
    offline: 'FULL',
    tags: ['konto', 'datenschutz', 'batterie'],
  },
  {
    id: 'premium',
    name: 'Premium',
    description: 'Upgrade auf Premium-Pläne und sperre zusätzliche Features frei',
    route: '/PremiumPlans',
    category: 'settings',
    icon: 'Zap',
    requires: 'free',
    offline: 'NONE',
    tags: ['bezahlung', 'upgrade', 'premium'],
  },

  // === Legal & Support ===
  {
    id: 'help',
    name: 'Hilfe & Support',
    description: 'FAQ, Kontakt zum Support und Fehlerbericht',
    route: '/Help',
    category: 'legal',
    icon: 'HelpCircle',
    requires: 'free',
    offline: 'FULL',
    tags: ['hilfe', 'faq', 'support'],
  },
  {
    id: 'privacy',
    name: 'Datenschutz',
    description: 'Datenschutzerklärung und Datenbearbeitung',
    route: '/Datenschutz',
    category: 'legal',
    icon: 'Shield',
    requires: 'free',
    offline: 'FULL',
    tags: ['datenschutz', 'privacy'],
  },
  {
    id: 'impressum',
    name: 'Impressum',
    description: 'Impressum und rechtliche Informationen',
    route: '/Impressum',
    category: 'legal',
    icon: 'FileText',
    requires: 'free',
    offline: 'FULL',
    tags: ['legal', 'impressum'],
  },
  {
    id: 'terms',
    name: 'AGB',
    description: 'Allgemeine Geschäftsbedingungen',
    route: '/AGB',
    category: 'legal',
    icon: 'FileText',
    requires: 'free',
    offline: 'FULL',
    tags: ['legal', 'terms'],
  },
];

// === Registry Queries ===

export class ToolRegistry {
  private static toolMap: Map<string, ToolDefinition> = new Map();
  private static initialized = false;

  static {
    this.init();
  }

  private static init() {
    if (this.initialized) return;
    TOOLS.forEach(tool => this.toolMap.set(tool.id, tool));
    this.initialized = true;
  }

  static getToolById(id: string): ToolDefinition | undefined {
    return this.toolMap.get(id);
  }

  static getToolByRoute(route: string): ToolDefinition | undefined {
    return TOOLS.find(tool => tool.route === route);
  }

  static getToolsByCategory(category: ToolCategory): ToolDefinition[] {
    return TOOLS.filter(tool => tool.category === category);
  }

  static getToolsByPlanLevel(level: PlanLevel): ToolDefinition[] {
    const planHierarchy: Record<PlanLevel, number> = {
      free: 0,
      basic: 1,
      pro: 2,
      elite: 3,
      ultimate: 3,
      friends: 4,
    };

    const userRank = planHierarchy[level] ?? 0;
    return TOOLS.filter(tool => {
      const toolRank = planHierarchy[tool.requires] ?? 0;
      return userRank >= toolRank;
    });
  }

  static getToolsByOfflineSupport(support: OfflineSupport): ToolDefinition[] {
    return TOOLS.filter(tool => {
      if (support === 'FULL') return tool.offline === 'FULL';
      if (support === 'PARTIAL') return tool.offline === 'FULL' || tool.offline === 'PARTIAL';
      return true; // NONE includes everything
    });
  }

  static searchByTag(tag: string): ToolDefinition[] {
    return TOOLS.filter(tool => tool.tags?.includes(tag.toLowerCase()));
  }

  static searchByName(query: string): ToolDefinition[] {
    const q = query.toLowerCase();
    return TOOLS.filter(
      tool =>
        tool.name.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        tool.tags?.some(tag => tag.includes(q))
    );
  }

  static isToolAccessible(tool: ToolDefinition, userPlan: PlanLevel): boolean {
    const planHierarchy: Record<PlanLevel, number> = {
      free: 0,
      basic: 1,
      pro: 2,
      elite: 3,
      ultimate: 3,
      friends: 4,
    };

    const userRank = planHierarchy[userPlan] ?? 0;
    const toolRank = planHierarchy[tool.requires] ?? 0;
    return userRank >= toolRank;
  }

  static listBetaTools(): ToolDefinition[] {
    return TOOLS.filter(tool => tool.beta);
  }

  static listByCategory(): Map<ToolCategory, ToolDefinition[]> {
    const grouped = new Map<ToolCategory, ToolDefinition[]>();
    TOOLS.forEach(tool => {
      if (!grouped.has(tool.category)) {
        grouped.set(tool.category, []);
      }
      grouped.get(tool.category)!.push(tool);
    });
    return grouped;
  }

  static getAllTools(): ToolDefinition[] {
    return [...TOOLS];
  }

  static getToolCount(): number {
    return TOOLS.length;
  }

  static validateTool(tool: ToolDefinition): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!tool.id || !/^[a-z0-9-]+$/.test(tool.id)) {
      errors.push('Tool ID must be lowercase alphanumeric with hyphens');
    }

    if (!tool.name || tool.name.length === 0) {
      errors.push('Tool must have a name');
    }

    if (!tool.route || !tool.route.startsWith('/')) {
      errors.push('Tool must have a valid route starting with /');
    }

    if (!['ai', 'map', 'weather', 'logbook', 'planning', 'gear', 'community', 'knowledge', 'settings', 'legal'].includes(tool.category)) {
      errors.push('Tool must have a valid category');
    }

    if (!['free', 'basic', 'pro', 'elite', 'ultimate', 'friends'].includes(tool.requires)) {
      errors.push('Tool must have a valid plan requirement');
    }

    if (!['NONE', 'PARTIAL', 'FULL'].includes(tool.offline)) {
      errors.push('Tool must have valid offline support level');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export default ToolRegistry;
