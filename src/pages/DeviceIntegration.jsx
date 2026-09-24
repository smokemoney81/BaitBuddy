import React, { useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  Bluetooth,
  Wifi,
  MapPin,
  Thermometer,
  Fish,
  Target,
  Zap,
  CheckCircle2,
  AlertCircle,
  Info
} from "lucide-react";
import { motion } from "framer-motion";
import TabBar from "@/components/layout/TabBar";

const DEVICE_CATEGORIES = {
  sonar: {
    title: "Smarte Fischfinder & Echolote",
    icon: Fish,
    description: "Bluetooth/Wi-Fi Echolote für Tiefe, Temperatur und Fischsichtung",
    devices: [
      {
        name: "Deeper Smart Sonar PRO+",
        type: "Castable Echolot",
        connection: "Wi-Fi",
        features: ["90m Reichweite", "Wassertemperatur", "GPS Mapping", "Fischsichtung"],
        specs: {
          frequency: "290kHz / 90kHz",
          depth: "0.5-80m",
          temperature: "-10°C bis +40°C",
          battery: "5.5h Laufzeit",
          waterproof: "IPX7"
        },
        integration: {
          realtime: "Live-Tiefenprofile in der App anzeigen",
          logging: "Automatische Tiefe/Temperatur bei Fangeinträgen",
          ai: "KI-Analyse für optimale Ködertiefe",
          spots: "Auto-Annotation von Spot-Details"
        },
        price: "€249"
      },
      {
        name: "Garmin Striker Vivid 4cv",
        type: "Fest montiertes Echolot",
        connection: "Bluetooth",
        features: ["CHIRP Sonar", "ClearVü", "GPS", "Quickdraw Contours"],
        specs: {
          display: "4.3\" Farbdisplay",
          frequency: "CHIRP 77/200kHz + GT20-TM",
          depth: "0.6-488m (Süßwasser)",
          power: "12V DC",
          waterproof: "IPX7"
        },
        integration: {
          realtime: "Sonar-Daten live auf Smartphone",
          logging: "GPS-Koordinaten und Tiefenkarten sync",
          ai: "Bodenbeschaffenheit für Köderempfehlung",
          spots: "Automatisches Mapping von Unterwasser-Strukturen"
        },
        price: "€179"
      }
    ]
  },
  navigation: {
    title: "GPS-Tracker & Navigation",
    icon: MapPin,
    description: "Präzise Positionierung und Routenaufzeichnung",
    devices: [
      {
        name: "Garmin GPSMAP 64sx",
        type: "Handheld GPS",
        connection: "Bluetooth",
        features: ["Multi-GNSS", "3-Achsen Kompass", "Wireless Datenübertragung"],
        specs: {
          accuracy: "< 3m mit WAAS",
          battery: "15h AA Batterien",
          memory: "8GB + MicroSD",
          waterproof: "IPX7",
          weight: "230g"
        },
        integration: {
          realtime: "Live GPS-Koordinaten für Spots",
          logging: "Automatische Wegpunkt-Setzung bei Fang",
          ai: "Routen-Analyse für beste Angelplätze",
          spots: "Präzise Spot-Koordinaten (±1m Genauigkeit)"
        },
        price: "€349"
      },
      {
        name: "Humminbird GPS Heading Sensor",
        type: "Boot-Navigationssystem",
        connection: "NMEA 2000 + Bluetooth",
        features: ["10Hz GPS", "Kompass-Kurs", "Geschwindigkeit", "COG/SOG"],
        specs: {
          update_rate: "10Hz",
          heading: "1° Genauigkeit",
          connection: "NMEA 2000 Backbone",
          power: "12V DC (0.1A)",
          waterproof: "IPX7"
        },
        integration: {
          realtime: "Boot-Position und -geschwindigkeit live",
          logging: "Fahrtrouten und Drift-Analyse",
          ai: "Strömungs- und Windkorrektur-Empfehlungen",
          spots: "Trolling-Muster und Hot-Spots Recording"
        },
        price: "€299"
      }
    ]
  },
  sensors: {
    title: "Wasserqualität-Sensoren",
    icon: Thermometer,
    description: "pH, Temperatur, Sauerstoff und weitere Wasserparameter",
    devices: [
      {
        name: "YSI ProDSS Multiparameter",
        type: "Profi-Wassersonde",
        connection: "Bluetooth + USB",
        features: ["pH", "Temperatur", "Leitfähigkeit", "Sauerstoff", "Trübung"],
        specs: {
          sensors: "4 gleichzeitige Parameter",
          depth: "200m Kabel verfügbar",
          accuracy: "pH ±0.1, Temp ±0.15°C",
          memory: "100.000 Datenpunkte",
          battery: "16h Dauerbetrieb"
        },
        integration: {
          realtime: "Live-Wasserqualität Dashboard",
          logging: "Umweltdaten bei jedem Fangeintrag",
          ai: "Parameter-basierte Fisch-Vorhersagen",
          spots: "Wasserqualitäts-Profile der Angelplätze"
        },
        price: "€1.899"
      },
      {
        name: "Hanna HI-98129 Pocket pH/EC/TDS",
        type: "Handheld-Messgerät",
        connection: "Bluetooth (HI-92000 Interface)",
        features: ["pH", "EC", "TDS", "Temperatur", "Wasserfest"],
        specs: {
          ph_range: "0.00 bis 14.00 pH",
          ec_range: "0 bis 3999 µS/cm",
          accuracy: "±0.05 pH, ±2% EC",
          calibration: "Automatisch 1/2/3 Punkt",
          battery: "700h Betrieb"
        },
        integration: {
          realtime: "Schnelle Wasseranalyse vor Ort",
          logging: "pH/Leitfähigkeit in Fangbuch",
          ai: "Optimale Köder je Wasserqualität",
          spots: "Wasserchemie-Profiling pro Angelplatz"
        },
        price: "€89"
      }
    ]
  },
  smart_gear: {
    title: "Smart Angelausrüstung",
    icon: Target,
    description: "Intelligente Rollen, Waagen und Bite-Sensoren",
    devices: [
      {
        name: "Anglr Bullseye Bite Detection",
        type: "Smart Bissanzeiger",
        connection: "Bluetooth 5.0",
        features: ["Motion Detection", "Weather Resistant", "Multi-Rod", "Mobile Alerts"],
        specs: {
          battery: "6 Monate (CR2032)",
          range: "100m Bluetooth",
          sensitivity: "3-stufig einstellbar",
          weight: "28g",
          waterproof: "IP67"
        },
        integration: {
          realtime: "Push-Benachrichtigung bei Biss",
          logging: "Automatischer Fang-Timer",
          ai: "Biss-Muster-Analyse für Hot-Times",
          spots: "Aktivitäts-Heatmap pro Angelplatz"
        },
        price: "€149"
      },
      {
        name: "Rapala Touch Screen Scale 50lb",
        type: "Bluetooth-Angelwaage",
        connection: "Bluetooth",
        features: ["50lb/25kg Kapazität", "Touchscreen", "Foto-Tagging", "Wetterdaten"],
        specs: {
          capacity: "25kg / 0.01kg Genauigkeit",
          display: "2.8\" LCD Touchscreen",
          memory: "8GB für Fotos",
          battery: "Li-Ion wiederaufladbar",
          waterproof: "IPX4"
        },
        integration: {
          realtime: "Gewicht direkt in Fangbuch übertragen",
          logging: "Fotos automatisch mit GPS/Zeit getaggt",
          ai: "Gewichts-Trends und -vorhersagen",
          spots: "Durchschnittsgewicht pro Angelplatz"
        },
        price: "€199"
      },
      {
        name: "Penn Spinfisher VI Smart Reel",
        type: "Intelligente Angelrolle",
        connection: "Bluetooth + App",
        features: ["Cast Distance", "Retrieve Speed", "Line Counter", "Drag Tension"],
        specs: {
          gear_ratio: "6.2:1",
          capacity: "280yds/12lb",
          drag: "25lb HT-100 Drag",
          sensors: "Hall-Sensor + Accelerometer",
          battery: "USB-C wiederaufladbar"
        },
        integration: {
          realtime: "Wurfdistanz-Messung für Arcade-Game",
          logging: "Drill-Dauer und -intensität",
          ai: "Optimaler Rollenwiderstand je Fischart",
          spots: "Wurfweiten-Analyse pro Platz"
        },
        price: "€329"
      }
    ]
  }
};

import PremiumGuard from "@/components/premium/PremiumGuard";
import PageTitle from "@/components/layout/PageTitle";

export default function DeviceIntegration() {
  return (
    <PremiumGuard requiredPlan="pro" feature="Geräte-Integration">
      <DeviceIntegrationInner />
    </PremiumGuard>
  );
}

const categoryTabs = Object.entries(DEVICE_CATEGORIES).map(([key, cat]) => ({
  id: key,
  label: cat.title.split(' ')[0],
}));

function DeviceIntegrationInner() {
  const [connectedDevices, setConnectedDevices] = useState(new Set());
  const [activeTab, setActiveTab] = useState("sonar");

  const toggleDevice = (deviceName) => {
    setConnectedDevices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(deviceName)) {
        newSet.delete(deviceName);
      } else {
        newSet.add(deviceName);
      }
      return newSet;
    });
  };

  const category = DEVICE_CATEGORIES[activeTab];
  const CatIcon = category.icon;

  return (
    <div className="bb-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <PageTitle title="Smart Geräte-Integration" subtitle="Verbinde professionelle Angel-Hardware mit BaitBuddy." />
      </motion.div>

      {/* Connected Devices Overview */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="bb-card"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Aktive Verbindungen</h2>
          <span className="bb-pill-success text-xs">
            {connectedDevices.size} verbunden
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: Fish, label: 'Echolote', count: '2 kompatibel', color: '#60a5fa' },
            { icon: MapPin, label: 'GPS', count: '2 kompatibel', color: '#34d399' },
            { icon: Thermometer, label: 'Sensoren', count: '2 kompatibel', color: '#fb923c' },
            { icon: Target, label: 'Smart Gear', count: '3 kompatibel', color: '#a78bfa' },
          ].map(item => (
            <div key={item.label} className="bb-stat-card text-center">
              <item.icon size={28} style={{ color: item.color, margin: '0 auto 8px' }} />
              <div className="text-white font-medium text-sm">{item.label}</div>
              <div className="text-xs" style={{ color: 'var(--bb-muted)' }}>{item.count}</div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Device Categories */}
      <TabBar
        tabs={categoryTabs}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="grid gap-5"
      >
        <div className="bb-card" style={{ borderColor: 'rgba(0,229,255,.25)' }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ background: 'rgba(0,229,255,.1)' }}>
              <CatIcon size={24} style={{ color: 'var(--bb-cyan)' }} />
            </div>
            <div>
              <div className="text-lg font-bold text-white">{category.title}</div>
              <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>{category.description}</p>
            </div>
          </div>
        </div>

        {category.devices.map((device, index) => (
          <motion.div
            key={device.name}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bb-card"
          >
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-2">{device.name}</h3>
                    <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--bb-muted)' }}>
                      <span className="bb-pill-info text-xs">{device.type}</span>
                      <div className="flex items-center gap-1">
                        {device.connection.includes('Bluetooth') ?
                          <Bluetooth size={14} /> :
                          <Wifi size={14} />
                        }
                        {device.connection}
                      </div>
                      <span className="font-semibold" style={{ color: '#34d399' }}>{device.price}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={connectedDevices.has(device.name)}
                      onCheckedChange={() => toggleDevice(device.name)}
                    />
                    {connectedDevices.has(device.name) ? (
                      <CheckCircle2 size={18} style={{ color: '#34d399' }} />
                    ) : (
                      <AlertCircle size={18} style={{ color: 'var(--bb-muted)' }} />
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <h4 className="text-white font-medium text-sm mb-2">Features</h4>
                  <div className="flex flex-wrap gap-2">
                    {device.features.map((feature, idx) => (
                      <span key={idx} className="px-2 py-1 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,.06)', color: 'var(--bb-muted)' }}>
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <h4 className="text-white font-medium text-sm mb-2">Technische Daten</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    {Object.entries(device.specs).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span style={{ color: 'var(--bb-muted)' }} className="capitalize">{key.replace('_', ' ')}:</span>
                        <span className="text-white">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="lg:w-80">
                <h4 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
                  <Zap size={14} style={{ color: 'var(--bb-cyan)' }} />
                  BaitBuddy Integration
                </h4>
                <div className="grid gap-2">
                  {Object.entries(device.integration).map(([type, description]) => (
                    <div key={type} className="p-3 rounded-xl" style={{ background: 'rgba(0,0,0,.25)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--bb-cyan)' }} />
                        <span className="text-xs font-medium capitalize" style={{ color: 'var(--bb-cyan)' }}>
                          {type.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>{description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Integration Benefits */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bb-card"
      >
        <div className="flex items-center gap-2 mb-4">
          <Info size={20} style={{ color: '#60a5fa' }} />
          <h2 className="text-lg font-bold text-white">Vorteile der Geräte-Integration</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold mb-3" style={{ color: '#34d399' }}>Automatisierte Datenerfassung</h3>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--bb-muted)' }}>
              <li>Tiefe, Temperatur und GPS automatisch bei jedem Fang</li>
              <li>Keine manuellen Eingaben mehr nötig</li>
              <li>Präzise Umweltdaten für bessere Analysen</li>
              <li>Lückenlose Dokumentation aller Angelsessions</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-3" style={{ color: '#60a5fa' }}>KI-Enhanced Vorhersagen</h3>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--bb-muted)' }}>
              <li>Bessere Fang-Prognosen durch mehr Datenpunkte</li>
              <li>Personalisierte Köder- und Tiefenempfehlungen</li>
              <li>Optimale Zeiten basierend auf Geräte-Historie</li>
              <li>Spots-Ranking mit Hardware-unterstützten Scores</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
