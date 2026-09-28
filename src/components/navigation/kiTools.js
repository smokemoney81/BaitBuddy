import { Eye, ChartColumn, Droplet, Satellite, WandSparkles, Cuboid, ScanEye, Link2, ScanSearch, ChefHat } from 'lucide-react';

// KI-Werkzeuge — einzige Liste für den Nav-Eintrag „KI-Tools" (Seite
// KiTools.jsx) und den gleichnamigen Bereich im Command Center. Der KI-Buddy
// selbst steht nicht darin: Er sitzt fest in der Mitte der Bottom-Nav.
export const KI_TOOLS = [
  { path: 'AI', name: 'Fischbestimmung & Biss', icon: Eye, description: 'Fischart per Kamera erkennen und Bisse live anzeigen.' },
  { path: 'Analysis', name: 'Fang-Analyse', icon: ChartColumn, description: 'Muster in deinen Fängen: Zeiten, Köder, Gewässer.' },
  { path: 'WaterAnalysis', name: 'Gewässeranalyse', icon: Droplet, description: 'Wasserwerte deuten und passend fischen.' },
  { path: 'SatelliteAnalysis', name: 'Satellitenanalyse', icon: Satellite, description: 'Strukturen und Hotspots aus dem Luftbild.' },
  { path: 'BaitMixer', name: 'Köderempfehlung', icon: WandSparkles, description: 'Der passende Köder für Gewässer und Zielfisch.' },
  { path: 'Koeder3D', name: '3D-Köderführung', icon: Cuboid, description: 'Laufverhalten von Kunstködern in 3D ansehen.' },
  { path: 'ARView', name: 'AR-Gewässer', icon: ScanEye, description: 'Gewässer und Tiefen in erweiterter Realität.' },
  { path: 'ARKnotenAssistent', name: 'AR Knoten AI', icon: Link2, description: 'Knoten Schritt für Schritt mit Anleitung.' },
  { path: 'GearRecognition', name: 'Ausrüstung erkennen', icon: ScanSearch, description: 'Ausrüstung per Foto erfassen.' },
  { path: 'FishRecipes', name: 'Fischrezepte', icon: ChefHat, description: 'Rezepte passend zu deinem Fang.' },
];

// Für das Command Center (Einträge als [Name, Route]).
export const KI_TOOL_LINKS = KI_TOOLS.map(tool => [tool.name, tool.path]);
