import React, { useState, useEffect } from "react";
import { auth } from "@/api/auth";
import LicensesSection from "@/components/licenses/LicensesSection";
import PremiumGuard from "@/components/premium/PremiumGuard";
import { useFeatureTracking } from "@/hooks/useFeatureTracking";
import PageTitle from "@/components/layout/PageTitle";

function LicensesContent() {
  useFeatureTracking("lizenzen");
  return (
    <div className="min-h-screen px-4 pb-32">
      <PageTitle className="mb-4" title="Deine Lizenzen" subtitle="Angelschein, Gewässerkarten und Erlaubnisse an einem Ort." />
      <LicensesSection />
    </div>
  );
}

export default function Licenses() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      try {
        setUser(await auth.me());
      } catch (e) {
        console.log("User not logged in:", e);
      }
      setLoading(false);
    };
    loadUser();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-cyan-400">Laden...</div>
      </div>
    );
  }

  return (
    <PremiumGuard 
      user={user} 
      requiredPlan="pro"
      feature="Die Lizenzverwaltung ist ein Pro-Feature"
    >
      <LicensesContent />
    </PremiumGuard>
  );
}