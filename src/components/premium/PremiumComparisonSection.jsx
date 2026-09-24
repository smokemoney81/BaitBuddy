
import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Check, Zap, Users, Package, BarChart3, MapPin, Palette, Shield, Bluetooth, Gamepad2, ShieldOff } from "lucide-react";
import { User } from "@/entities/User";
import { isPremiumActive } from "@/components/utils/premium";

export default function PremiumComparisonSection() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const u = await User.me();
        setUser(u);
      } catch {
        // Not logged in
      }
    })();
  }, []);

  const isPremium = isPremiumActive(user?.premium_until);

  const features = [
    {
      category: "KI-Fangberatung",
      icon: <Zap className="w-5 h-5 text-amber-400" />,
      standard: "3 konkrete Schritte (Montage, Tiefe, Köderführung)",
      premium: "Detaillierte Profi-Berichte mit Erfolgsprognosen, optimalen Zeiten, Backup-Strategien und Equipment-Optimierung"
    },
    {
      category: "KI-Buddy Gespräche",
      icon: <Zap className="w-5 h-5 text-amber-400" />,
      standard: "Einzelne Fragen & Antworten",
      premium: "Kontextbezogene Gespräche mit Gedächtnis, priorisierte Bearbeitung"
    },
    {
      category: "Geräte-Anbindung",
      icon: <Bluetooth className="w-5 h-5 text-cyan-400" />,
      standard: "Nur Simulator-Modus",
      premium: "Bluetooth-Geräte verbinden, Live-Daten von Echoloten & Sensoren"
    },
    {
      category: "Premium-Spiele",
      icon: <Gamepad2 className="w-5 h-5 text-purple-400" />,
      standard: "Keine Spiele verfügbar",
      premium: "Match-3 Quest Spiel mit doppelten Credits, weitere Premium-Spiele"
    },
    {
      category: "Ausrüstungsmanagement",
      icon: <Package className="w-5 h-5 text-purple-400" />,
      standard: "Inventarverwaltung, 1 Packliste",
      premium: "Unbegrenzte Packlisten, automatische Wartungserinnerungen"
    },
    {
      category: "Spot-Verwaltung",
      icon: <MapPin className="w-5 h-5 text-orange-400" />,
      standard: "Spots speichern, verschieben, einfache Notizen",
      premium: "Private Spot-Gruppen zum Teilen mit Freunden, erweiterte Notizen mit Fotos"
    },
    {
      category: "Karten-Features",
      icon: <MapPin className="w-5 h-5 text-orange-400" />,
      standard: "Online-Karten, Basis-Tiefenkarten",
      premium: "Offline-Karten, erweiterte Tiefenkarten-Ebenen, Routenplanung"
    },
    {
      category: "Daten-Analyse",
      icon: <BarChart3 className="w-5 h-5 text-green-400" />,
      standard: "Top-Zeiten, Spots, Köder-Statistiken",
      premium: "Erweiterte Analysen, Heatmaps, Korrelationen, Daten-Export (CSV/PDF), unbegrenzte Historie"
    },
    {
      category: "Community-Features",
      icon: <Users className="w-5 h-5 text-pink-400" />,
      standard: "Öffentliche Posts, Kommentare, Likes",
      premium: "Private Community-Gruppen, 'Verifizierter Angler'-Badge"
    },
    {
      category: "Werbefreie App",
      icon: <ShieldOff className="w-5 h-5 text-emerald-400" />,
      standard: "Werbeanzeigen nach 3 Tagen",
      premium: "Komplett werbefreie Erfahrung"
    },
    {
      category: "Personalisierung",
      icon: <Palette className="w-5 h-5 text-indigo-400" />,
      standard: "Standard-Theme (Dark Mode)",
      premium: "Exklusive App-Themes & Skins, personalisierte Einstellungen"
    },
    {
      category: "Support & Service",
      icon: <Shield className="w-5 h-5 text-blue-400" />,
      standard: "Standard-Support",
      premium: "Priorisierter Premium-Support, direkter Draht zum Entwicklerteam"
    }
  ];

  const scrollToShop = () => {
    document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="space-y-8">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2 text-3xl font-bold text-white">
          <Crown className="w-8 h-8 text-amber-400" />
          Standard vs. Premium
        </div>
        <p className="text-xl text-gray-300 max-w-3xl mx-auto">
          Entdecke alle Funktionen von BaitBuddy und erfahre, welche Vorteile dir Premium bietet.
        </p>
        {isPremium && (
          <div className="flex items-center justify-center gap-2">
            <Badge className="bg-amber-600 text-white px-4 py-2 text-sm">
              <Crown className="w-4 h-4 mr-2" />
              Du hast Premium!
            </Badge>
          </div>
        )}
      </div>

      <div className="max-w-6xl mx-auto">
        <Card className="glass-morphism border-gray-800 rounded-2xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-gray-800/50 to-gray-700/50">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <CardTitle className="text-white text-lg">Feature</CardTitle>
              </div>
              <div>
                <CardTitle className="text-white text-lg flex items-center justify-center gap-2">
                  Standard Version
                  <Badge variant="outline" className="text-gray-300">Kostenlos</Badge>
                </CardTitle>
              </div>
              <div>
                <CardTitle className="text-white text-lg flex items-center justify-center gap-2">
                  <Crown className="w-5 h-5 text-amber-400" />
                  Premium Version
                </CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {features.map((feature, index) => (
              <div 
                key={feature.category} 
                className={`grid grid-cols-3 gap-4 p-4 ${index % 2 === 0 ? 'bg-gray-800/20' : 'bg-gray-800/40'}`}
              >
                <div className="flex items-center gap-3">
                  {feature.icon}
                  <span className="text-white font-medium">{feature.category}</span>
                </div>
                <div className="flex items-center text-gray-300 text-sm">
                  <Check className="w-4 h-4 text-emerald-400 mr-2 flex-shrink-0" />
                  {feature.standard}
                </div>
                <div className="flex items-center text-gray-300 text-sm">
                  <Crown className="w-4 h-4 text-amber-400 mr-2 flex-shrink-0" />
                  {feature.premium}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {!isPremium && (
          <div className="text-center mt-8">
            <Button 
              onClick={scrollToShop}
              size="lg"
              className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white px-8 py-4 text-lg font-semibold"
            >
              <Crown className="w-5 h-5 mr-2" />
              Jetzt Premium werden
            </Button>
            <p className="text-gray-400 text-sm mt-2">
              Upgrade jetzt und schalte alle Premium-Features frei!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
