import React, { useState, useEffect } from 'react';
import ARWater3D from '@/components/ar/ARWater3D';
import ARTutorial from '@/components/ar/ARTutorial';
import { auth } from "@/api/auth";
import PremiumGuard from "@/components/premium/PremiumGuard";

export default function ARView() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await auth.me();
        setUser(currentUser);
      } catch {
        // User nicht angemeldet - normal bei Gästen
      }
    };
    loadUser();
  }, []);

  return (
    <PremiumGuard 
      user={user} 
      requiredPlan="pro"
      feature="AR-Gewässer-Ansicht 3D"
    >
      <div className="min-h-screen bg-gray-950">
        <ARWater3D />
        <ARTutorial />
      </div>
    </PremiumGuard>
  );
}