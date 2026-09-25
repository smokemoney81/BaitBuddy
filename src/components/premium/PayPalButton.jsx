import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Crown, Mail, ExternalLink, Clock } from 'lucide-react';
import { SUPPORT_EMAIL } from '@/lib/supportContact';

export default function PayPalButton({ planId, planName, planPrice, onSuccess: _onSuccess }) {
  const features = {
    basic: ['KI-Fangberatung', 'Spot-Verwaltung', 'Fangbuch', 'Wetter-Integration'],
    standard: ['Alles aus Basic', 'Offline-Karten', 'Erweiterte Analysen', 'Geraete-Anbindung'],
    premium: ['Alles aus Standard', 'Profi-Berichte mit Erfolgsprognosen', 'Private Spot-Gruppen', 'Premium-Spiele & Themes', 'Priorisierter Support'],
  };

  const planFeatures = features[planId] || features.premium;

  const mailSubject = encodeURIComponent(`BaitBuddy Premium Upgrade – ${planName} (${planPrice} EUR)`);
  const mailBody = encodeURIComponent(`Hallo BaitBuddy-Team,\n\nichmoechte den ${planName}-Plan fuer ${planPrice} EUR/Monat upgraden.\n\nBitte sendet mir die Zahlungsdetails.\n\nVielen Dank!`);
  const mailtoLink = `mailto:${SUPPORT_EMAIL}?subject=${mailSubject}&body=${mailBody}`;

  return (
    <Card className="border border-emerald-600/30 bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl overflow-hidden">
      <CardContent className="p-6 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Crown className="w-6 h-6 text-amber-400" />
            <span className="text-xl font-bold text-white">{planName}</span>
          </div>
          <div className="text-3xl font-extrabold text-emerald-400">
            {planPrice} EUR
            <span className="text-sm font-normal text-gray-400"> / Monat</span>
          </div>
        </div>

        <ul className="space-y-2">
          {planFeatures.map((feature, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
              <span className="text-emerald-400 mt-0.5 flex-shrink-0">+</span>
              {feature}
            </li>
          ))}
        </ul>

        <div className="space-y-3">
          <a href={mailtoLink} className="block">
            <Button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl">
              <Mail className="w-4 h-4 mr-2" />
              Per E-Mail upgraden
            </Button>
          </a>

          <a href="https://paypal.me/CatchGBT" target="_blank" rel="noopener noreferrer" className="block">
            <Button variant="outline" className="w-full border-amber-500/40 text-amber-400 hover:bg-amber-600/10 font-semibold py-3 rounded-xl">
              <ExternalLink className="w-4 h-4 mr-2" />
              Via PayPal.me bezahlen
            </Button>
          </a>
        </div>

        <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-800/60 rounded-xl p-3 border border-gray-700/50">
          <Clock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <span>Nach der Zahlung erhaeltst du deine Freischaltung innerhalb von 24 Stunden.</span>
        </div>
      </CardContent>
    </Card>
  );
}