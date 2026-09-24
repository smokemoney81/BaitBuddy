import React, { useState, useEffect, useRef } from "react";
import { User } from "@/entities/User";
import { useLocation } from "@/components/location/LocationManager";
import { Lightbulb, MapPin, Fish, Cloud } from "lucide-react";
// The import for isPremiumActive is removed as per the change request.
import { getPersonalizedGreeting } from "@/components/utils/greetings";

const trialOffer = "Limitiertes Angebot: 10 Tage alle Premium-Funktionen fuer nur 10 Euro freischalten - jetzt auf der Premium-Seite!";

const featureTips = [
  "Dashboard: Dein zentraler Ueberblick mit Wetter, Spots und KI-Empfehlungen auf einen Blick.",
  "KI-Buddy BaitBuddy: Persoenlicher Angel-Assistent fuer Tipps, Strategien und Fragen rund ums Angeln.",
  "Digitales Fangbuch: Dokumentiere jeden Fang mit Foto, Gewicht, Laenge und Standort.",
  "Interaktive Angelkarte: Finde Spots, Vereine, Angelparks und Gewaesser in deiner Naehe.",
  "Eigene Spots: Speichere deine Lieblingsplaetze und teile sie privat mit Freunden.",
  "Wetter-Vorhersage: 5-Tage-Prognose mit Wind, Luftdruck, UV und Mondphasen.",
  "Wetter-Alarme: Werde rechtzeitig vor Sturm, Regen oder optimalen Beisszeiten gewarnt.",
  "KI-Foto-Analyse: Lade ein Fangfoto hoch und die KI erkennt Art, Groesse und Bewertung.",
  "KI-Koeder-Mischer: Erhalte Rezepte fuer perfekte Boilies und Lockstoffe je nach Zielfisch.",
  "Trip-Planer: Plane deine Angeltour mit KI-Unterstuetzung inklusive Packliste.",
  "Gewaesser-Wasseranalyse: Pruefe Temperatur, Tiefe, Sicht und Wasserqualitaet.",
  "Gewaesseranalyse: Wassertemperatur, Luftdruck und Wind fuer deinen Standort.",
  "Hotspot-Erkennung: KI markiert die vielversprechendsten Stellen auf der Karte.",
  "Fangprognose: Berechnet die Beiss-Wahrscheinlichkeit basierend auf Wetter und Daten.",
  "AR-Gewaesser-Ansicht: Tauche per Augmented Reality unter die Wasseroberflaeche.",
  "Tiefenkarten: Detaillierte Bathymetrie zeigt dir Strukturen und Kanten unter Wasser.",
  "Bathymetrie-Crowdsourcing: Teile deine Echolot-Daten mit der Community.",
  "Geraete-Integration: Verbinde Echolote, Bissanzeiger und Smart-Sensoren.",
  "Voice Control Hey Buddy: Steuere die App freihaendig per Sprachbefehl.",
  "Live-Bissanzeiger: Smartphone-Kamera erkennt Bisse in Echtzeit.",
  "CatchCam: KI analysiert deinen Fang direkt vom Live-Foto.",
  "Schonzeiten-Datenbank: Pruefe Mindestmasse und Schonzeiten fuer alle Bundeslaender.",
  "Angelschein-Quiz: Bereite dich mit hunderten Fragen auf die Pruefung vor.",
  "AR-Knoten-Assistent: Lerne Angelknoten Schritt fuer Schritt in 3D.",
  "Tutorials: Videos und Anleitungen zu Techniken, Montagen und Equipment.",
  "Lizenz-Verwaltung: Speichere Angelscheine digital und werde an Verlaengerungen erinnert.",
  "Community-Feed: Teile deine Faenge, like Posts und tausche dich mit Anglern aus.",
  "Clans: Gruende oder tritt einer Anglergruppe bei und sammelt gemeinsam Punkte.",
  "Events und Wettbewerbe: Nimm an Voting-Aktionen und Fang-Challenges teil.",
  "Ranking-System: Steige in der Bestenliste auf mit jedem dokumentierten Fang.",
  "Fang-Statistiken: Visualisiere deine Erfolge nach Art, Spot und Zeitraum.",
  "PDF-Export: Lade dein Fangbuch und Berichte als PDF herunter.",
  "Angelbedarf-Marktplatz: Kaufe und verkaufe gebrauchtes Equipment.",
  "Angelshop-Finder: Lokale Shops und Angebote in deiner Naehe.",
  "Offline-Karten: Lade Kartenmaterial fuer den Einsatz ohne Internetverbindung.",
  "Spot-Gruppen: Teile private Spots nur mit ausgewaehlten Freunden.",
  "Geteiltes Fangbuch: Mit Freunden gemeinsam Erfolge dokumentieren.",
  "Reisezeit-Berechnung: Wie lange brauchst du zum naechsten Spot?",
  "KI-Trip-Detailbericht: Ausfuehrliche Auswertung deiner geplanten Tour.",
  "Mond- und Sonnenkalender: Plane nach Auf- und Untergangszeiten.",
  "Pruefungsvorbereitung: Lerne Geraete-, Gewaesser- und Gesetzeskunde.",
  "Mehrsprachig: Nutze die App auf Deutsch und in weiteren Sprachen.",
  "Cloud-Sync: Deine Daten sind auf allen Geraeten verfuegbar.",
  "Personalisierte Tipps: Empfehlungen passen sich deinem Erfahrungslevel an.",
  "Funktions-Bewertungen: Gib Feedback zu Features und beeinflusse die Entwicklung."
];

const getDefaultTips = (user, location) => {
  const tips = [];
  
  // Trial-Angebot Hinweis
  tips.push({
    icon: <Lightbulb className="w-4 h-4 text-amber-400" />,
    text: trialOffer,
  });

  // Persönliche Begrüßung mit Tageszeit
  if (user) {
    tips.push({
      icon: <Lightbulb className="w-4 h-4 text-yellow-400" />,
      text: getPersonalizedGreeting(user) + "!",
    });
  } else {
    tips.push({
      icon: <Lightbulb className="w-4 h-4 text-yellow-400" />,
      text: "Willkommen bei BaitBuddy!",
    });
  }

  // Standort
  if (location && location.name) {
    const locationName = String(location.name).slice(0, 20);
    tips.push({
      icon: <MapPin className="w-4 h-4 text-emerald-400" />,
      text: `Standort: ${locationName}`,
    });
  }

  // Add all feature tips (alle Funktionen mit einem Satz)
  const tipColors = ['text-blue-300', 'text-green-300', 'text-purple-300', 'text-orange-300', 'text-cyan-300', 'text-red-300', 'text-emerald-300', 'text-pink-300'];
  featureTips.forEach((text, index) => {
    tips.push({
      icon: <Lightbulb className={`w-4 h-4 ${tipColors[index % tipColors.length]}`} />,
      text: text,
    });
  });

  // Trial-Angebot nochmal am Ende einstreuen
  tips.push({
    icon: <Lightbulb className="w-4 h-4 text-amber-400" />,
    text: trialOffer,
  });

  // KI-Buddy Tipps (für alle)
  tips.push({
    icon: <Lightbulb className="w-4 h-4 text-green-400" />,
    text: "Dein KI-Buddy hilft bei der Fangplanung und beantwortet alle Angel-Fragen!",
  });
  tips.push({
    icon: <Fish className="w-4 h-4 text-emerald-400" />,
    text: "Schnelle Köder-Empfehlungen? Frag einfach den KI-Buddy nach den besten Tipps!",
  });
  tips.push({
    icon: <MapPin className="w-4 h-4 text-teal-400" />,
    text: "KI-Buddy kennt die besten Gewässer-Strategien für jeden Zielfisch!",
  });
  tips.push({
    icon: <Cloud className="w-4 h-4 text-slate-400" />,
    text: "Wetter-Analyse unklar? Der KI-Buddy erklärt dir die besten Angel-Bedingungen!",
  });

  return tips;
};

export default function EnhancedTicker() {
  const [tips, setTips] = useState([]);
  const [user, setUser] = useState(null);
  const { currentLocation } = useLocation();
  const tickerRef = useRef(null);
  const [speed, setSpeed] = useState(100);

  useEffect(() => {
    (async () => {
      try {
        const u = await User.me();
        setUser(u);
        setSpeed(u?.settings?.ticker_speed || 100);
      } catch {
        setUser(null);
      }
    })();
  }, []);

  useEffect(() => {
    setTips(getDefaultTips(user, currentLocation));

    const handleNewTip = (e) => {
      const detail = e?.detail || {};
      const newTip = {
        icon: detail.icon || <Lightbulb className="w-4 h-4 text-yellow-400" />,
        text: String(detail.text || "").slice(0, 200),
      };
      if (newTip.text) {
        setTips(prev => [...prev, newTip].slice(-10));
      }
    };

    window.addEventListener("tickerAddTip", handleNewTip);
    return () => window.removeEventListener("tickerAddTip", handleNewTip);
  }, [user, currentLocation]);

  const duration = tips.reduce((acc, tip) => {
    const textLength = String(tip?.text || "").length;
    return acc + textLength;
  }, 0) * (0.1 / (speed/100));

  return (
    <div className="w-full h-8 bg-gray-900/50 overflow-hidden flex items-center border-b border-gray-800">
      <div className="flex items-center h-full">
        <div 
          ref={tickerRef}
          className="whitespace-nowrap flex items-center h-full text-gray-300 text-sm pl-4" 
          style={{
            animation: `scroll ${Math.max(20, duration)}s linear infinite`,
          }}
        >
          {tips.concat(tips).map((tip, index) => {
            const tipText = String(tip?.text || "");
            if (!tipText) return null;
            return (
              <div key={index} className="flex items-center mr-6">
                {tip.icon}
                <span className="ml-2">{tipText}</span>
              </div>
            );
          })}
        </div>
      </div>
      <style>{`
        @keyframes scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}