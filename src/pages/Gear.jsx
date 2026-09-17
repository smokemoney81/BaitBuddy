import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Compass, Fish, MapPin, RefreshCcw, Wand2, Search, CloudSun, Loader2, Camera, Wrench, ChevronRight } from "lucide-react";
import { toast, Toaster } from "sonner";
import { catchgbtChat } from "@/functions/catchgbtChat";
import { useHaptic } from "@/components/utils/HapticFeedback";
import PremiumGuard from "@/components/premium/PremiumGuard";
import { auth } from "@/api/auth";
import { MobileSelect } from "@/components/ui/mobile-select";
import { TackleManager } from "@/components/gear/TackleManager";

// Leaflet CSS nachladen
if (typeof document !== "undefined") {
  var _link = document.querySelector('link[data-leaflet]');
  if (!_link) {
    var link = document.createElement("link");
    link.setAttribute("data-leaflet", "1");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }
}

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// Vorratsdaten: gängige Marken/Modelle (statisch, offline verwendbar)
const REEL_DATA = {
  Shimano: [
    "Aero (Match/Feeder)", "Aero BB", "Aero Technium MgS XSD", "Aero Technium MgS XTD",
    "Aero XR", "Aerlex XSB", "Aerlex XTB", "Aerlex XSC", "Aerlex XTC",
    "Aerlex XTC Spod", "Aldebaran BFS", "Aldebaran MGL", "Antares B",
    "Baitrunner CI4+ XTB", "Baitrunner D", "Baitrunner DL-RB", "Baitrunner OC",
    "Baitrunner ST-RB", "Baitrunner XT-RB", "Baitrunner X-Aero FB", "Baitrunner X-Aero RA",
    "Bantam", "Bull's Eye", "Calcutta Conquest A", "Calcutta Conquest MD", "Curado BFS",
    "Curado DC", "Curado K", "Curado K MGL", "Curado M", "Exsence A", "Forcemaster A",
    "FX FC", "Metanium MGL B", "Miravel", "Nasci FC", "Nexave FE", "Nexave FI",
    "Plays 3000 A", "Plays 4000 A", "Power Aero XSC", "Power Aero XTC", "Sahara 2500",
    "Sahara FJ", "Sahara RD", "Saragosa SW A", "Sienna FG", "Sienna RE", "SLX",
    "SLX 70 A", "SLX BFS", "SLX DC", "SLX XT A", "SLX XT DC", "Socorro SW",
    "Speedmaster II", "Spheros SW", "Spheros SW A", "Stella FK", "Stella SW C",
    "Stradic 3000", "Stradic GTM-RC", "Super GT-RD", "Sustain FJ", "Tekota A",
    "Tiagra", "TLD", "TLD II A", "Torium A", "TR G", "Ultegra 2500", "Ultegra FC",
    "Ultegra FD", "Ultegra XSD", "Ultegra XSE", "Ultegra XTD", "Ultegra XTE",
    "Vanford 2500", "Vanford FA", "Vanquish FC"
  ].sort(),
  Daiwa: ["Ninja LT 2500", "Fuego LT 2500", "Ballistic 3000"],
  "Abu Garcia": ["Revo SX 30", "Cardinal 3000"],
  Penn: ["Battle III 3000", "Spinfisher VI 3500"],
  Okuma: ["Ceymar C-30", "Epixor 30"]
};

const ROD_DATA = {
  Shimano: [
    "Aero Pro Competition Pole", "Aero Pro Feeder", "Aero X1 Bolo", "Aero X1 Coarse",
    "Aero X1A Carp Feeder", "Aero X1A Feeder", "Aero X2 Match", "Aero X3 Coarse",
    "Aero X3 Match", "Aero X5 Bolo", "Aero X5 Coarse", "Aero X5 Competition Pole",
    "Aero X5A Coarse", "Aero X6 Match Float", "Aero X7 Bolo", "Aero X7 Coarse",
    "Aero X7 Competition Pole", "Aero X7A Distance Feeder", "Aero X7A Finesse Feeder",
    "Aero X7A Precision Feeder", "Beastmaster CX Trout Zander", "Cardiff Exlead Competition",
    "Catana Allround Tele GT", "Curado (Rod)", "Expride 266ML", "Forcemaster Trout Competition",
    "Purist PX1 River Specialist", "STC AX Spinning", "STC AX Spinning Mini Tele",
    "STC AX Spinning Multi Length", "STC XR Stream Spinning", "Sedona Trout Lake Special",
    "Specialist TX Float", "Specialist TX Lite", "Specialist TX Play", "Sustain Spinning",
    "TX-2A Carp", "TX-7A Carp", "TX-B Spod", "Technium Trout Competition Allround",
    "Tribal TX-1A Carp", "Tribal TX-1B Carp", "Tribal TX-2 Carp", "Tribal TX-4A Carp",
    "Tribal TX-5A Carp", "Tribal TX-Plus Carp Spod & Marker", "Tribal TX-Ultra A",
    "Tribal TXA Carp Spod", "Vengeance 270M", "Vengeance CX Spinning",
    "Vengeance CX Super Sensitive", "Yasei AX (range)", "Yasei BB AX Predator",
    "Yasei LTD", "Zodias 270ML", "Zodias Spinning"
  ].sort(),
  Daiwa: ["Prorex 270M", "Ninja X 270ML", "Legalis 240ML"],
  "St. Croix": ["Triumph 270ML", "Premier 240M"],
  Berkley: ["Cherrywood 270M", "E-Motion 270ML"],
  "Savage Gear": ["Black Savage 270M", "SG2 7-23g"],
  "Ugly Stik": ["GX2 6'6\"" , "Elite 7'"]
};

const LINE_DIAMETERS = ["0.06","0.08","0.10","0.12","0.14","0.16","0.18","0.20","0.23","0.25","0.28","0.30"];
const HOOK_SIZES = ["2/0","1/0","1","2","4","6","8","10","12"];
const LURE_TYPES = ["Wobbler","Gummifisch","Spinner","Blinker","Jig","Topwater","Spinnerbait","Chatterbait"];
const WATER_TYPES = ["Fluss","See","Küste"];
const TARGETS = ["Barsch","Hecht","Zander","Forelle","Karpfen","Dorsch","Meerforelle","Barbe"];

function saveLocal(key, value){
  try{ localStorage.setItem(key, JSON.stringify(value)); }catch(_e){}
}
function loadLocal(key, fallback){
  try{
    var raw = localStorage.getItem(key);
    if (!raw) return fallback;
    var v = JSON.parse(raw);
    return v == null ? fallback : v;
  }catch(_e){ return fallback; }
}

// Hilfs-Hook für Debouncing
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

function LocationPicker(props){
  const { position, onChange } = props;
  useMapEvents({
    click(e){ onChange([e.latlng.lat, e.latlng.lng]); }
  });
  return position ? <Marker position={position} icon={defaultIcon} /> : null;
}

function analyze(setup, env){
  // Heuristische Regeln, basierend auf Temperatur, Wind, Wassertrübung, Gewässer, Tageszeit, Ziel
  var t = Number(env.tempC);
  var wind = Number(env.windKmh);
  var clear = env.turbidity === "klar";
  var water = env.waterType;
  var target = env.target;
  var time = env.timeOfDay; // dawn, day, dusk, night

  var rodPower = "ML"; // ML, M, MH
  var primaryLure = "Wobbler"; // Corrected variable name from 'lure' to 'primaryLure'
  var colors = clear ? "natürliche Dekore" : "auffällig/UV";
  var notes = [];
  var recLine = setup.lineDiameter + " mm";
  var hook = setup.hookSize;

  if (t <= 10){ rodPower = "ML"; primaryLure = "Jig"; notes.push("Kälter: langsam führen, kleineres Profil"); }
  if (t > 10 && t <= 18){ rodPower = "M"; primaryLure = "Wobbler/Spinner"; }
  if (t > 18){ rodPower = "M–MH"; primaryLure = time === "dawn" || time === "dusk" ? "Topwater" : "Gummifisch/Wobbler"; notes.push("Warm: schnellere Präsentation möglich"); }
  if (!clear){ notes.push("Trübes Wasser: auffällige Farben, laute Köder"); }
  if (wind >= 20){ notes.push("Starker Wind: etwas schwerere Köder, größere Silhouette"); }

  if (water === "Küste"){ notes.push("Salzwasser: korrosionsfeste Rolle, kräftigeres Vorfach"); if (t > 12) primaryLure = "Gummifisch/Metall"; rodPower = "M–MH"; }

  // Zielartspezifische Nuancen
  if (target === "Barsch"){ hook = hook || "6"; primaryLure = primaryLure === "Topwater" ? "Topwater/Mini" : primaryLure; recLine = setup.lineDiameter < 0.12 ? "0.12–0.14 mm" : recLine; }
  if (target === "Hecht"){ hook = hook || "1/0"; notes.push("Stahl- oder Titanvorfach empfehlenswert"); rodPower = t > 5 ? "M–MH" : "M"; recLine = setup.lineDiameter < 0.18 ? "≥0.18 mm" : recLine; }
  if (target === "Zander"){ hook = hook || "2"; notes.push("Kontakt zum Grund halten"); primaryLure = "Jig/Gummifisch"; }
  if (target === "Forelle"){ hook = hook || "8"; primaryLure = clear ? "Spinner/Wobbler klein" : "Gummiwurm"; recLine = setup.lineDiameter <= 0.12 ? recLine : "0.10–0.12 mm"; }
  if (target === "Dorsch" || target === "Meerforelle"){ rodPower = "M–MH"; }

  return {
    rodPower,
    primaryLure,
    colorHint: colors,
    lineHint: recLine,
    hookHint: hook,
    notes
  };
}

function GearContent({ user }){ // Renamed from App to GearContent
  const [reelBrand, setReelBrand] = useState(loadLocal("reelBrand","Shimano"));
  const [reelModel, setReelModel] = useState(loadLocal("reelModel","Vanford 2500"));
  const [rodBrand, setRodBrand] = useState(loadLocal("rodBrand","Shimano"));
  const [rodModel, setRodModel] = useState(loadLocal("rodModel","Zodias 270ML"));
  const [lineDiameter, setLine] = useState(loadLocal("lineDiameter","0.12"));
  const [hookSize, setHook] = useState(loadLocal("hookSize","6"));

  const [temp, setTemp] = useState(loadLocal("temp",15));
  const [wind, setWind] = useState(loadLocal("wind",10));
  const [turbidity, setTurbidity] = useState(loadLocal("turbidity","klar"));
  const [waterType, setWaterType] = useState(loadLocal("waterType","See"));
  const [time, setTime] = useState(loadLocal("time","day"));
  const [target, setTarget] = useState(loadLocal("target","Barsch"));
  const [position, setPosition] = useState(loadLocal("position",null));

  const [isClient, setClient] = useState(false);
  useEffect(() => { setClient(true); }, []);

  // Standortsuche-States
  const [searchQuery, setSearchQuery] = useState(loadLocal("gearLocationSearchQuery", ""));
  const [suggestions, setSuggestions] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const debouncedSearchQuery = useDebounce(searchQuery, 500);

  const { triggerHaptic } = useHaptic(); // Initialized useHaptic
  const navigate = useNavigate();

  // Daten bei Änderung speichern
  useEffect(() => { saveLocal("reelBrand", reelBrand); }, [reelBrand]);
  useEffect(() => { saveLocal("reelModel", reelModel); }, [reelModel]);
  useEffect(() => { saveLocal("rodBrand", rodBrand); }, [rodBrand]);
  useEffect(() => { saveLocal("rodModel", rodModel); }, [rodModel]);
  useEffect(() => { saveLocal("lineDiameter", lineDiameter); }, [lineDiameter]);
  useEffect(() => { saveLocal("hookSize", hookSize); }, [hookSize]);

  useEffect(() => { saveLocal("temp", temp); }, [temp]);
  useEffect(() => { saveLocal("wind", wind); }, [wind]);
  useEffect(() => { saveLocal("turbidity", turbidity); }, [turbidity]);
  useEffect(() => { saveLocal("waterType", waterType); }, [waterType]);
  useEffect(() => { saveLocal("time", time); }, [time]);
  useEffect(() => { saveLocal("target", target); }, [target]);
  useEffect(() => { saveLocal("position", position); }, [position]);
  useEffect(() => { saveLocal("gearLocationSearchQuery", searchQuery); }, [searchQuery]);


  // Wetterdaten laden
  const loadWeatherData = useCallback(async (lat, lng) => {
    if (!lat || !lng || typeof lat !== 'number' || typeof lng !== 'number') return;

    setWeatherLoading(true);
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", lat.toString());
      url.searchParams.set("longitude", lng.toString());
      url.searchParams.set("current", "temperature_2m,wind_speed_10m");
      url.searchParams.set("timezone", "auto");

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`Wetter API Fehler: ${response.status}`);

      const data = await response.json();

      if (data.current) {
        // Automatisch Temperatur und Wind aktualisieren
        if (data.current.temperature_2m !== null && data.current.temperature_2m !== undefined) {
          setTemp(Math.round(data.current.temperature_2m));
        }
        if (data.current.wind_speed_10m !== null && data.current.wind_speed_10m !== undefined) {
          // Wind von m/s zu km/h konvertieren
          setWind(Math.round(data.current.wind_speed_10m * 3.6));
        }
        toast.success("Wetterdaten aktualisiert.");
      }
    } catch (error) {
      console.error("Fehler beim Laden der Wetterdaten:", error);
      toast.error("Wetterdaten konnten nicht geladen werden.");
    }
    setWeatherLoading(false);
  }, []);

  // Ortssuche
  const searchPlaces = useCallback(async (query) => {
    if (!query || query.length < 2) {
      setSuggestions([]);
      setSearchLoading(false); // Ensure loading is off if query is too short
      return;
    }

    setSearchLoading(true);
    try {
      const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
      url.searchParams.set("name", query);
      url.searchParams.set("count", "5");
      url.searchParams.set("language", "de");
      url.searchParams.set("format", "json");

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`Geocoding Fehler: ${response.status}`);

      const data = await response.json();
      setSuggestions(data?.results || []);
    } catch (error) {
      console.error("Fehler bei der Ortssuche:", error);
      setSuggestions([]);
      toast.error("Fehler bei der Ortssuche.");
    }
    setSearchLoading(false);
  }, []);

  // Debounced search
  useEffect(() => {
    searchPlaces(debouncedSearchQuery);
  }, [debouncedSearchQuery, searchPlaces]);

  // Ort auswählen
  const selectLocation = useCallback((lat, lng, name) => {
    triggerHaptic('selection'); // Added haptic feedback
    setPosition([lat, lng]);
    const locationName = name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    setSearchQuery(locationName);
    setSuggestions([]);
    toast.success(`Ort ausgewählt: ${locationName}`);

    // Wetterdaten für den neuen Standort laden
    loadWeatherData(lat, lng);
  }, [loadWeatherData, triggerHaptic]); // Added triggerHaptic to dependencies

  // Initial Wetterdaten laden wenn Position vorhanden
  useEffect(() => {
    if (position && Array.isArray(position) && position.length === 2) {
      loadWeatherData(position[0], position[1]);
    }
  }, [position, loadWeatherData]); // Add position to dependencies to re-trigger if it changes initially, loadWeatherData for stability.

  const analysis = useMemo(() => {
    return analyze({ reelBrand, reelModel, rodBrand, rodModel, lineDiameter, hookSize }, { tempC: temp, windKmh: wind, turbidity, waterType, timeOfDay: time, target });
  }, [reelBrand, reelModel, rodBrand, rodModel, lineDiameter, hookSize, temp, wind, turbidity, waterType, time, target]);

  // Plan speichern Funktion
  const saveToPlan = async () => {
    triggerHaptic('medium'); // Added haptic feedback
    try {
      // Dynamischer Import, da FishingPlan möglicherweise nur in einem bestimmten Kontext existiert
      const { FishingPlan } = await import("@/entities/FishingPlan");

      const locationName = searchQuery || "Unbekannter Ort";
      const planTitle = `${target} am ${locationName}`;

      const timeOfDayText =
        time === 'dawn' ? 'Morgengrauen' :
        time === 'day' ? 'Tag' :
        time === 'dusk' ? 'Abenddämmerung' :
        'Nacht';

      const plan = {
        title: planTitle,
        target_fish: target,
        spot_info: `${locationName} (${waterType})${position ? ` - Koordinaten: ${position[0].toFixed(4)}, ${position[1].toFixed(4)}` : ''}`,
        weather_summary: `${temp}°C, Wind ${wind} km/h, ${turbidity}es Wasser, ${timeOfDayText}`,
        gear_summary: `Rolle: ${reelBrand} ${reelModel}, Rute: ${rodBrand} ${rodModel}, Schnur: ${lineDiameter}mm, Haken: ${hookSize}`,
        steps: [
          `Empfohlene Rutenaktion: ${analysis.rodPower}`,
          `Primärer Ködertyp: ${analysis.primaryLure}`,
          `Köderfarben: ${analysis.colorHint}`,
          `Schnur-Empfehlung: ${analysis.lineHint}`,
          `Haken-Empfehlung: ${analysis.hookHint}`,
          ...analysis.notes
        ]
      };

      await FishingPlan.create(plan);

      // Erfolgsmeldung und Navigation
      toast.success("Plan erfolgreich gespeichert!");
      window.location.href = "/TripPlanner"; // Annahme: Der Trip Planer ist unter dieser URL erreichbar

    } catch (error) {
      console.error("Fehler beim Speichern des Plans:", error);
      toast.error("Fehler beim Speichern des Plans");
    }
  };

  // Neue Funktion für KI-Ausrüstungsanalyse
  const analyzeGearWithAI = async () => {
    triggerHaptic('medium'); // Added haptic feedback
    try {
      const locationName = searchQuery || "Unbekannter Ort";

      const timeOfDayText =
        time === 'dawn' ? 'Morgengrauen' :
        time === 'day' ? 'Tag' :
        time === 'dusk' ? 'Abenddämmerung' :
        'Nacht';

      const setupDescription = `
Analysiere mein Angel-Setup auf Fehler und gib Optimierungstipps:

AUSRÜSTUNG:
- Rolle: ${reelBrand} ${reelModel}
- Rute: ${rodBrand} ${rodModel}
- Schnur: ${lineDiameter}mm
- Haken: Größe ${hookSize}

BEDINGUNGEN:
- Ort: ${locationName}
- Gewässer: ${waterType}
- Temperatur: ${temp}°C
- Wind: ${wind} km/h
- Wasserklarheit: ${turbidity}
- Tageszeit: ${timeOfDayText}
- Zielfisch: ${target}

Prüfe bitte:
1. Passt die Ausrüstung zusammen?
2. Ist sie für die Bedingungen geeignet?
3. Welche Fehler siehst du?
4. Was sind deine Verbesserungsvorschläge?
5. Gibt es bessere Alternativen?

Sei konkret und praxisorientiert!`;

      // KI-Buddy Chatbot öffnen
      window.dispatchEvent(new CustomEvent("toggleChatbot"));

      // Kurz warten, damit sich der Chatbot öffnet
      setTimeout(async () => {
        try {
          const response = await catchgbtChat({
            messages: [{
              role: "user",
              content: setupDescription
            }],
            detailLevel: 'detailed' // Ausführliche Analyse für bessere Tipps
          });

          const aiReply = response?.data?.reply || response?.reply || "Entschuldigung, ich konnte deine Ausrüstung nicht analysieren.";

          // Antwort an Chatbot senden (simuliert eine normale Chat-Nachricht)
          window.dispatchEvent(new CustomEvent('aiGearAnalysisResponse', {
            detail: {
              question: "KI-Ausrüstungsanalyse",
              answer: aiReply,
              autoSpeak: true // Flag für automatische Sprachausgabe
            }
          }));

          toast.success("KI-Buddy analysiert deine Ausrüstung!");

        } catch (error) {
          console.error("Fehler bei der KI-Ausrüstungsanalyse:", error);
          toast.error("KI-Analyse fehlgeschlagen. Versuche es erneut.");
        }
      }, 500);

    } catch (error) {
      console.error("Fehler beim Starten der KI-Analyse:", error);
      toast.error("Fehler beim Starten der Analyse");
    }
  };


  function SelectGroup({ label, value, onChange, options }){
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400">{label}</label>
        <MobileSelect
          value={value}
          onValueChange={(newValue) => {
            triggerHaptic('selection');
            onChange(newValue);
            toast.info(`${label} geaendert: ${newValue}`);
          }}
          label={label}
          options={options.map(o => ({ value: o, label: o }))}
          className="bg-gray-700 border-gray-600 text-white"
        />
      </div>
    );
  }

  const resetAll = () => { // Changed to named function for clarity, as per original outline.
    if (confirm("Wirklich alle Einstellungen zurücksetzen?")){
      triggerHaptic('medium'); // Added haptic feedback
      ["reelBrand", "reelModel", "rodBrand", "rodModel", "lineDiameter", "hookSize", "temp", "wind", "turbidity", "waterType", "time", "target", "position", "gearLocationSearchQuery"]
        .forEach(k => localStorage.removeItem(k));
      toast.info("Alle Einstellungen zurückgesetzt.");
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 pb-32">
      <Toaster richColors position="top-right" />
      <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* --- Block 1: Ausrüstung --- */}
        <div className="rounded-2xl border border-cyan-900/40 p-4 space-y-4 glass-morphism bg-gradient-to-br from-gray-900/80 to-gray-900/40">
          <h2 className="text-xl font-bold flex items-center gap-2 text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.7)]"><Fish className="text-cyan-400"/> Deine Ausrüstung</h2>
          <div className="grid grid-cols-2 gap-4">
            <SelectGroup label="Rollen-Marke" value={reelBrand} onChange={v => {setReelBrand(v); setReelModel(REEL_DATA[v]?.[0] || "");}} options={Object.keys(REEL_DATA)} />
            <SelectGroup label="Rollen-Modell" value={reelModel} onChange={setReelModel} options={REEL_DATA[reelBrand] || []} />
            <SelectGroup label="Ruten-Marke" value={rodBrand} onChange={v => {setRodBrand(v); setRodModel(ROD_DATA[v]?.[0] || "");}} options={Object.keys(ROD_DATA)} />
            <SelectGroup label="Ruten-Modell" value={rodModel} onChange={setRodModel} options={ROD_DATA[rodBrand] || []} />
            <SelectGroup label="Schnur Ø (mm)" value={lineDiameter} onChange={setLine} options={LINE_DIAMETERS} />
            <SelectGroup label="Haken-Größe" value={hookSize} onChange={setHook} options={HOOK_SIZES} />
          </div>
        </div>

        {/* --- Block 2: Bedingungen --- */}
        <div className="rounded-2xl border border-emerald-900/40 p-4 space-y-4 glass-morphism bg-gradient-to-br from-gray-900/80 to-gray-900/40">
          <h2 className="text-xl font-bold flex items-center gap-2 text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.7)]">
            <Compass className="text-green-400"/> Bedingungen & Spot
            {weatherLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
          </h2>

          {/* Ortssuche */}
          <div className="space-y-2">
            <label className="text-xs text-gray-400">Angelort suchen</label>
            <div className="relative">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="z.B. Müggelsee, Berlin..."
                  className="flex-1 p-2 rounded-lg bg-gray-700 text-white border border-gray-600"
                />
                {position && (
                  <button type="button"
                    onClick={() => position && loadWeatherData(position[0], position[1])}
                    disabled={weatherLoading}
                    className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                    title="Wetter aktualisieren"
                  >
                    <CloudSun className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Suchvorschläge */}
              {(suggestions.length > 0 && searchQuery.length > 1 && !searchLoading) && (
                <div className="absolute z-10 mt-1 w-full bg-gray-800 rounded-lg border border-gray-600 shadow-xl max-h-60 overflow-y-auto">
                  {suggestions.map((suggestion, index) => (
                    <button type="button"
                      key={index}
                      onClick={() => selectLocation(suggestion.latitude, suggestion.longitude, suggestion.name)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-700 flex items-center gap-2 text-white first:rounded-t-lg last:rounded-b-lg"
                    >
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <span>
                        {suggestion.name}
                        {suggestion.admin1 ? `, ${suggestion.admin1}` : ""}
                        {suggestion.country ? `, ${suggestion.country}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {searchLoading && debouncedSearchQuery.length > 1 && (
                <div className="absolute z-10 mt-1 w-full bg-gray-800 rounded-lg border border-gray-600 shadow-xl p-3 text-center text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" />
                    Suchen...
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400 flex items-center gap-1">
                Luft-Temp (°C)
                {weatherLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              </label>
              <input type="number" value={temp} onBlur={e=>toast.info(`Temperatur gesetzt: ${e.target.value}°C`)} onChange={e=>setTemp(e.target.value)} className="p-2 rounded-lg bg-gray-700 text-white border border-gray-600"/>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-400 flex items-center gap-1">
                Wind (km/h)
                {weatherLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              </label>
              <input type="number" value={wind} onBlur={e=>toast.info(`Wind gesetzt: ${e.target.value} km/h`)} onChange={e=>setWind(e.target.value)} className="p-2 rounded-lg bg-gray-700 text-white border border-gray-600"/>
            </div>
            <SelectGroup label="Wassertrübung" value={turbidity} onChange={setTurbidity} options={["klar","normal","trüb"]}/>
            <SelectGroup label="Gewässertyp" value={waterType} onChange={setWaterType} options={WATER_TYPES}/>
            <SelectGroup label="Tageszeit" value={time} onChange={setTime} options={["dawn","day","dusk","night"]}/>
            <SelectGroup label="Zielfisch" value={target} onChange={setTarget} options={TARGETS}/>
          </div>
          <div className="h-40 rounded-lg overflow-hidden border border-gray-600">
            {isClient &&
              <MapContainer center={position || [51.1,10.4]} zoom={position?13:5} style={{ height: "100%", width: "100%", backgroundColor:"#374151" }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'/>
                <LocationPicker position={position} onChange={(pos) => selectLocation(pos[0], pos[1], `${pos[0].toFixed(4)}, ${pos[1].toFixed(4)}`)} />
              </MapContainer>
            }
          </div>
        </div>

        {/* --- Block 3: KI-Analyse --- */}
        <div className="rounded-2xl border border-purple-500/30 p-4 space-y-3 bg-gradient-to-br from-purple-900/20 to-blue-900/20 glass-morphism md:col-span-2 lg:col-span-1">
          <h2 className="text-xl font-bold flex items-center gap-2 text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.7)]">
            <Wand2 className="text-purple-400"/>
            KI-Analyse & Empfehlung
          </h2>
          {[
            { label: "Rutenaktion", value: analysis.rodPower, color: "text-cyan-300" },
            { label: "Ködertyp", value: analysis.primaryLure, color: "text-emerald-300" },
            { label: "Köderfarben", value: analysis.colorHint, color: "text-amber-300" },
            { label: "Schnur-Tipp", value: analysis.lineHint, color: "text-sky-300" },
            { label: "Haken-Tipp", value: analysis.hookHint, color: "text-purple-300" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-800/40 rounded-xl p-3 border border-gray-700/30 flex items-center justify-between gap-2">
              <span className="text-xs text-gray-400 font-medium shrink-0">{label}</span>
              <span className={`text-sm font-semibold ${color} text-right`}>{value}</span>
            </div>
          ))}
          {analysis.notes.length > 0 && (
            <div className="bg-gray-800/40 rounded-xl p-3 border border-gray-700/30 space-y-1.5">
              <div className="text-xs text-gray-400 font-medium mb-2">Hinweise</div>
              {analysis.notes.map((n,i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-1 h-1 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                  <p className="text-sm text-gray-300">{n}</p>
                </div>
              ))}
            </div>
          )}

          <button type="button"
            onClick={analyzeGearWithAI}
            className="w-full mt-2 p-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-900/30"
          >
            <Wand2 className="h-4 w-4" />
            KI-Buddy Setup-Check
          </button>

          <button type="button"
            onClick={saveToPlan}
            className="w-full p-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/30"
          >
            <Fish className="h-4 w-4" />
            In meinen Plan speichern
          </button>

          <button type="button" onClick={resetAll} className="w-full p-2 text-xs text-red-400/70 bg-red-900/20 rounded-xl hover:bg-red-900/40 flex items-center justify-center gap-2 transition-colors border border-red-900/30">
            <RefreshCcw className="h-3 w-3"/> Zurücksetzen
          </button>
        </div>

        {/* --- Schnellzugriff Ausrüstungs-Tools --- */}
        <div className="md:col-span-2 lg:col-span-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => navigate("/GearMaintenance")}
            className="flex items-center justify-between p-3 rounded-xl bg-amber-900/20 border border-amber-700/40 hover:bg-amber-900/30 transition text-left"
          >
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Wartungsprotokoll</p>
                <p className="text-xs text-gray-400">Pflege & Intervalle</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
          <button
            type="button"
            onClick={() => navigate("/GearRecognition")}
            className="flex items-center justify-between p-3 rounded-xl bg-cyan-900/20 border border-cyan-700/40 hover:bg-cyan-900/30 transition text-left"
          >
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Foto-Erkennung</p>
                <p className="text-xs text-gray-400">KI erkennt Ausrüstung</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* --- Tackle Management --- */}
        <div className="md:col-span-2 lg:col-span-3">
          <TackleManager userId={user?.id} />
        </div>
      </div>
    </div>
  );
}

export default function Gear() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const fetchedUser = await auth.me();
        setUser(fetchedUser);
      } catch (e) {
        console.log("User not logged in:", e);
        setUser(null); // Ensure user is null if not logged in
      } finally {
        setLoading(false);
      }
    };
    loadUser();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        <div className="text-cyan-400 ml-2">Laden...</div>
      </div>
    );
  }

  return (
    <PremiumGuard
      user={user}
      requiredPlan="basic"
      feature="Die Ausrüstungsanalyse ist ein Basic-Feature"
    >
      <GearContent user={user} />
    </PremiumGuard>
  );
}