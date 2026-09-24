import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { User } from '@/entities/User';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Crown, Coins, CheckCircle } from 'lucide-react';
import { isPremiumActive } from "@/components/utils/premium";
import PremiumShopCard from "@/components/premium/PremiumShopCard";

const premiumProducts = [
  { id: 'prem_7d', name: '1 Woche Premium', durationDays: 7, price: 1000 },
  { id: 'prem_30d', name: '1 Monat Premium', durationDays: 30, price: 3500 },
  { id: 'prem_365d', name: '1 Jahr Premium', durationDays: 365, price: 30000 },
];

export default function ShopSection() {
  const [user, setUser] = useState(null);
  const [feedback, setFeedback] = useState("");

  const fetchUser = async () => {
    try {
      const currentUser = await User.me();
      setUser(currentUser);
    } catch {
      // User not logged in
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const handlePurchase = async (product) => {
    if (!user) {
      toast.error("Bitte melde dich an, um Einkäufe zu tätigen.");
      return;
    }

    if (user.credits < product.price) {
      toast.error("Du hast nicht genügend Credits für diesen Einkauf.");
      return;
    }

    try {
      const newCredits = user.credits - product.price;
      
      const currentPremiumUntil = user.premium_until ? new Date(user.premium_until) : new Date();
      const newPremiumUntil = new Date(Math.max(currentPremiumUntil.getTime(), Date.now()));
      newPremiumUntil.setDate(newPremiumUntil.getDate() + product.durationDays);

      await User.updateMyUserData({
        credits: newCredits,
        premium_until: newPremiumUntil.toISOString(),
      });
      
      setFeedback(`Kauf erfolgreich! Dein Premium ist jetzt bis zum ${newPremiumUntil.toLocaleDateString('de-DE')} gültig.`);
      
      try {
          const audio = new Audio('data:audio/wav;base64,UklGRmYBAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YWIBAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA==');
          audio.volume = 0.4;
          audio.play();
        } catch (_soundError) {}

      await fetchUser(); // Refresh user data
      setTimeout(() => setFeedback(""), 5000);

    } catch (error) {
      console.error("Fehler beim Kauf:", error);
      toast.error("Ein Fehler ist aufgetreten. Bitte versuche es später erneut.");
    }
  };

  const isPremium = isPremiumActive(user?.premium_until);

  return (
    <Card className="glass-morphism border-gray-800 rounded-2xl">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Crown className="text-amber-400" />
          Premium Shop & Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Card className="bg-gray-800/50 border-gray-700 p-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Dein Status</h3>
              {isPremium ? (
                <p className="text-emerald-400 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Premium Aktiv
                </p>
              ) : (
                <p className="text-gray-400">Standard Mitglied</p>
              )}
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-sm">Gültig bis</p>
              <p className="text-white font-semibold">
                {user?.premium_until ? new Date(user.premium_until).toLocaleDateString('de-DE') : ' - '}
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-400 text-sm">Dein Guthaben</p>
              <p className="text-amber-400 font-semibold flex items-center justify-center gap-2">
                <Coins className="w-5 h-5" />
                {user?.credits?.toLocaleString('de-DE') || 0} Credits
              </p>
            </div>
          </div>
        </Card>

        {feedback && (
          <div className="p-3 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-sm text-center">
            {feedback}
          </div>
        )}

        <div>
          <h3 className="text-xl font-semibold text-white mb-4">Premium erwerben</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {premiumProducts.map(product => (
              <PremiumShopCard
                key={product.id}
                product={product}
                onPurchase={() => handlePurchase(product)}
                disabled={!user || user.credits < product.price}
              />
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-4 text-center">
            Credits verdienst du durch Fänge, das Abschließen von Spielen und andere Aktivitäten in der App.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}