import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, TrendingUp, Waves, Package, Wrench, MessageCircle,
  Layers, Crosshair, Activity, Droplets, Palette, Sun,
  Shield, Fish, Zap, ChefHat, CheckCircle, WifiOff
} from 'lucide-react';
import { useFeatureTracking } from '@/hooks/useFeatureTracking';

const TOOLS = [
  {
    id: 1,
    name: 'KI-SpotScanner',
    icon: MapPin,
    color: '#00E5FF',
    bg: 'from-[#0a1f2e] to-[#080F16]',
    accent: 'bg-cyan-500/20 border-cyan-500/30',
    route: '/MapPage',
    preview: [
      { label: 'Spotbewertung', value: '82%', color: 'text-green-400' },
      { label: 'Kante bei 4–7 m', small: true },
      { label: 'Bestes Zeitfenster', value: '19:10–21:40', small: true },
    ],
    tag: 'Karte · Analyse · Spots',
  },
  {
    id: 2,
    name: 'Fang-Pattern-Analyzer',
    icon: TrendingUp,
    color: '#00E5FF',
    bg: 'from-[#0a1f2e] to-[#080F16]',
    accent: 'bg-blue-500/20 border-blue-500/30',
    route: '/CatchStats',
    preview: [
      { label: 'Häufigste Fangzeiten', value: '19:15–21:30', color: 'text-cyan-400' },
      { label: 'Motoroil war stärkste Farbe', small: true },
      { label: 'Ø Größe: 62 cm', small: true },
    ],
    tag: 'Zander',
  },
  {
    id: 3,
    name: 'Gewässer-Scanner',
    icon: Waves,
    color: '#00E5FF',
    bg: 'from-[#0a1f2e] to-[#080F16]',
    accent: 'bg-teal-500/20 border-teal-500/30',
    route: '/WaterAnalysis',
    preview: [
      { label: 'Analyse abgeschlossen', color: 'text-green-400' },
      { label: 'Leicht eingetrübt', small: true },
      { label: 'Kontrastreicher Köder empfohlen', small: true },
    ],
    tag: 'Trübung · Vegetation · Strömung',
  },
  {
    id: 4,
    name: 'Tacklebox Scanner',
    icon: Package,
    color: '#FF9F0A',
    bg: 'from-[#1a1208] to-[#080F16]',
    accent: 'bg-amber-500/20 border-amber-500/30',
    route: '/GearRecognition',
    preview: [
      { label: '6 Köder erkannt', color: 'text-amber-400' },
      { label: 'Shad 10 cm ×3', small: true },
      { label: 'Wobbler 8 cm ×1', small: true },
    ],
    tag: 'Kamera · Erkennung · Ausrüstung',
  },
  {
    id: 5,
    name: 'KI-RigBuilder',
    icon: Wrench,
    color: '#00FF9D',
    bg: 'from-[#081a14] to-[#080F16]',
    accent: 'bg-green-500/20 border-green-500/30',
    route: '/BaitMixerPro',
    preview: [
      { label: 'Zander – Jiggen', color: 'text-green-400' },
      { label: 'Rute: 2,40 m / 10–35 g', small: true },
      { label: 'Vorfach: Fehlt', color: 'text-red-400', small: true },
    ],
    tag: 'Setup · Montage · Empfehlung',
  },
  {
    id: 6,
    name: 'KI-Angelcoach',
    icon: MessageCircle,
    color: '#00E5FF',
    bg: 'from-[#0a1f2e] to-[#080F16]',
    accent: 'bg-cyan-500/20 border-cyan-500/30',
    route: '/AnglerMode',
    preview: [
      { label: 'Angeln läuft', color: 'text-green-400' },
      { label: '01:24:18', color: 'text-cyan-400', large: true },
      { label: 'Bissindex 78%', small: true },
    ],
    tag: 'Live · Timer · Wetter · Buddy',
  },
  {
    id: 7,
    name: 'Depth & Structure Explorer',
    icon: Layers,
    color: '#00E5FF',
    bg: 'from-[#0a1f2e] to-[#080F16]',
    accent: 'bg-blue-500/20 border-blue-500/30',
    route: '/BathymetricCrowdsourcing',
    preview: [
      { label: '7 m', color: 'text-cyan-400', large: true },
      { label: 'Kante analysieren', color: 'text-cyan-300' },
      { label: 'Sehr interessant für Zander', small: true },
    ],
    tag: 'Tiefenkarte · 3D-Ansicht · Kante',
  },
  {
    id: 8,
    name: 'Zielfisch-Radar',
    icon: Crosshair,
    color: '#FF4560',
    bg: 'from-[#1a0810] to-[#080F16]',
    accent: 'bg-red-500/20 border-red-500/30',
    route: '/MapPage',
    preview: [
      { label: 'Zander', color: 'text-red-400', large: true },
      { label: 'Sehr geeignet: 88%', color: 'text-green-400', small: true },
      { label: 'Gut geeignet: 74%', small: true },
    ],
    tag: 'Heatmap · Wahrscheinlichkeit',
  },
  {
    id: 9,
    name: 'Fischaktivitäts-Timeline',
    icon: Activity,
    color: '#00E5FF',
    bg: 'from-[#0a1f2e] to-[#080F16]',
    accent: 'bg-cyan-500/20 border-cyan-500/30',
    route: '/CatchStats',
    preview: [
      { label: 'Zander – heute', color: 'text-cyan-400' },
      { label: 'Beste Zeit: 19:15–21:00', color: 'text-green-400', small: true },
      { label: 'Sehr hohe Aktivität', small: true },
    ],
    tag: 'Timeline · Aktivität · Prognose',
  },
  {
    id: 10,
    name: 'Pegel-Assistent',
    icon: Droplets,
    color: '#00E5FF',
    bg: 'from-[#0a1f2e] to-[#080F16]',
    accent: 'bg-blue-500/20 border-blue-500/30',
    route: '/Weather',
    preview: [
      { label: '+34 cm', color: 'text-green-400', large: true },
      { label: 'Rhein – Kaub', color: 'text-cyan-400' },
      { label: 'Strömungsarme Bereiche interessant', small: true },
    ],
    tag: 'Pegelstand · 24h · 7 Tage',
  },
  {
    id: 11,
    name: 'Köderfarben-Assistent',
    icon: Palette,
    color: '#FF9F0A',
    bg: 'from-[#1a1208] to-[#080F16]',
    accent: 'bg-amber-500/20 border-amber-500/30',
    route: '/BaitMixer',
    preview: [
      { label: 'Empfehlung', color: 'text-amber-400' },
      { label: 'Motoroil / UV', color: 'text-green-400', large: true },
      { label: 'Wasser leicht eingetrübt', small: true },
    ],
    tag: 'Wasserfarbe · Licht · Köder',
  },
  {
    id: 12,
    name: 'Sonnen- & Schatten-Planer',
    icon: Sun,
    color: '#FF9F0A',
    bg: 'from-[#1a1208] to-[#080F16]',
    accent: 'bg-yellow-500/20 border-yellow-500/30',
    route: '/Weather',
    preview: [
      { label: 'Sonnenaufgang 05:42', small: true },
      { label: 'Ab 19:00 Uhr Schatten', color: 'text-amber-400', small: true },
      { label: 'Ideal für Zander', color: 'text-green-400', small: true },
    ],
    tag: 'Kompass · Schatten · Zander',
  },
  {
    id: 13,
    name: 'Sicherheitscheck',
    icon: Shield,
    color: '#00FF9D',
    bg: 'from-[#081a14] to-[#080F16]',
    accent: 'bg-green-500/20 border-green-500/30',
    route: '/StartFishing',
    preview: [
      { label: 'Wetter: Unbedenklich', color: 'text-green-400', small: true },
      { label: 'Wind: Erhöhte Aufmerksamkeit', color: 'text-amber-400', small: true },
      { label: 'Aktuell keine kritischen Risiken', color: 'text-green-400', small: true },
    ],
    tag: 'Wetter · Gewitter · Sicherheit',
  },
  {
    id: 14,
    name: 'Catch & Release Assistent',
    icon: Fish,
    color: '#00E5FF',
    bg: 'from-[#0a1f2e] to-[#080F16]',
    accent: 'bg-cyan-500/20 border-cyan-500/30',
    route: '/Logbook',
    preview: [
      { label: 'Schonendes Zurücksetzen', color: 'text-cyan-400' },
      { label: 'Fisch im Wasser abhaken', small: true },
      { label: '00:28', color: 'text-amber-400', large: true },
    ],
    tag: 'Timer · Schritt-für-Schritt · C&R',
  },
  {
    id: 15,
    name: 'Drill-Assistent',
    icon: Zap,
    color: '#00E5FF',
    bg: 'from-[#0a1f2e] to-[#080F16]',
    accent: 'bg-blue-500/20 border-blue-500/30',
    route: '/AnglerMode',
    preview: [
      { label: 'Hecht im Drill', color: 'text-red-400' },
      { label: 'Ruhe bewahren', small: true },
      { label: 'Sprachmodus aktiv', color: 'text-cyan-400', small: true },
    ],
    tag: 'Live-Coaching · Voice · Drill',
  },
  {
    id: 16,
    name: 'Fischküche',
    icon: ChefHat,
    color: '#FF9F0A',
    bg: 'from-[#1a1208] to-[#080F16]',
    accent: 'bg-orange-500/20 border-orange-500/30',
    route: '/FishRecipes',
    preview: [
      { label: 'Dein Zander – 3,2 kg', color: 'text-amber-400' },
      { label: 'Zanderfilet mit Kräuterbutter', small: true },
      { label: 'Geeignet für 4–6 Portionen', small: true },
    ],
    tag: 'Rezepte · Verarbeitung · Zutaten',
  },
  {
    id: 17,
    name: 'Fang-Verifizierung',
    icon: CheckCircle,
    color: '#00FF9D',
    bg: 'from-[#081a14] to-[#080F16]',
    accent: 'bg-green-500/20 border-green-500/30',
    route: '/events/1',
    preview: [
      { label: 'Verifiziert', color: 'text-green-400', large: true },
      { label: 'Zander · 68 cm', small: true },
      { label: '#Zander2025 · Event', small: true },
    ],
    tag: 'Event · Einreichung · Bestätigung',
  },
  {
    id: 18,
    name: 'Offline Fishing Pack',
    icon: WifiOff,
    color: '#00E5FF',
    bg: 'from-[#0a1f2e] to-[#080F16]',
    accent: 'bg-slate-500/20 border-slate-500/30',
    route: '/OfflineFishingPack',
    preview: [
      { label: 'Trip offline verfügbar machen', color: 'text-cyan-400' },
      { label: 'Kartenbereich · Spots · Regeln', small: true },
      { label: '482 MB', color: 'text-amber-400', small: true },
    ],
    tag: 'Download · Karten · Offline',
  },
];

function ToolCard({ tool, onClick }) {
  const Icon = tool.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative rounded-2xl border overflow-hidden text-left transition-all active:scale-95 ${tool.accent}`}
      style={{ background: 'rgba(10,20,30,0.9)' }}
    >
      {/* Number badge */}
      <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
        <span className="text-[9px] font-bold text-white/60">{tool.id}</span>
      </div>

      {/* Status bar sim */}
      <div className="flex items-center justify-between px-3 pt-1.5 pb-0.5">
        <span className="text-[8px] text-white/40">9:31</span>
        <div className="flex gap-0.5 items-center">
          <div className="w-1 h-1 rounded-full bg-white/30" />
          <div className="w-1 h-1.5 rounded-full bg-white/40" />
          <div className="w-1 h-2 rounded-full bg-white/60" />
        </div>
      </div>

      {/* Content area */}
      <div className="px-3 pb-3">
        {/* Tool name header */}
        <div className="flex items-center gap-1.5 mb-2">
          <Icon size={10} style={{ color: tool.color }} />
          <span className="text-[10px] font-bold text-white/80 truncate">{tool.name}</span>
        </div>

        {/* Mini preview items */}
        <div className="space-y-1">
          {tool.preview.map((item, i) => (
            <div key={i} className={item.large ? 'py-0.5' : ''}>
              {item.large ? (
                <div className={`text-lg font-bold leading-none ${item.color || 'text-white'}`}>
                  {item.value || item.label}
                </div>
              ) : item.value ? (
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-white/50">{item.label}</span>
                  <span className={`text-[9px] font-semibold ${item.color || 'text-white/80'}`}>{item.value}</span>
                </div>
              ) : (
                <div className={`text-[9px] ${item.color || 'text-white/50'} leading-tight`}>{item.label}</div>
              )}
            </div>
          ))}
        </div>

        {/* Tag pill */}
        <div className="mt-2 inline-block px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10">
          <span className="text-[8px] text-white/40">{tool.tag}</span>
        </div>
      </div>
    </button>
  );
}

export default function KITools() {
  useFeatureTracking('ki_tools_overview');
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ background: '#080F16' }}>
      {/* Hero header */}
      <div
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #0D2137 0%, #091520 60%, #080F16 100%)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        {/* Subtle fishing silhouette gradient */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 80% 40%, rgba(0,180,255,0.08) 0%, transparent 60%)',
          }}
        />
        <div className="relative px-4 pt-4 pb-6">
          {/* Logo row */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
                  <Fish size={16} className="text-cyan-400" />
                </div>
                <div>
                  <div className="text-lg font-extrabold text-white leading-none">BaitBuddy</div>
                  <div className="text-[10px] text-cyan-400/80 tracking-widest uppercase">Mehr als Angeln</div>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-bold text-white/80 tracking-wide leading-tight">
                PLANEN. FINDEN. ANGELN.
              </div>
              <div className="text-[11px] font-bold text-white/80 tracking-wide">
                ERLEBEN. LERNEN.
              </div>
            </div>
          </div>

          <p className="text-[12px] text-white/50 mb-1">
            Dein digitaler Angelassistent – überall, immer, einen Biss voraus.
          </p>

          <div className="flex items-center gap-2 mt-3">
            <div
              className="px-3 py-1 rounded-full text-[11px] font-bold text-cyan-400 border border-cyan-500/40"
              style={{ background: 'rgba(0,229,255,0.08)' }}
            >
              BaitBuddy 2.0
            </div>
            <div className="text-[11px] text-white/40">18 KI-Tools · Alle Funktionen</div>
          </div>
        </div>
      </div>

      {/* Tools grid */}
      <div className="px-3 pb-32" style={{ paddingBottom: 'calc(100px + env(safe-area-inset-bottom))' }}>
        <div className="grid grid-cols-3 gap-2.5">
          {TOOLS.map((tool) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              onClick={() => navigate(tool.route)}
            />
          ))}
        </div>
      </div>

      {/* Bottom tagline */}
      <div
        className="fixed bottom-0 left-0 right-0 flex items-center justify-between px-4 py-2"
        style={{
          background: 'rgba(8,15,22,0.95)',
          borderTop: '1px solid rgba(0,229,255,0.1)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex items-center gap-1.5">
          <Fish size={14} className="text-cyan-400" />
          <span className="text-[12px] font-bold text-white">BaitBuddy 2.0</span>
          <span className="text-white/30 text-[12px]">────────</span>
        </div>
        <span className="text-[10px] text-white/40 italic">
          Ein Ziel. Alle Tools. Dein nächster Fang.
        </span>
      </div>
    </div>
  );
}
