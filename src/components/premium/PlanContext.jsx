import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { functions } from "@/api/frontendClient";
import { planMeetsRequirement, getPlanLevel } from './planHierarchy';
import { startGooglePlayReconciliation } from './googlePlayBilling';
import { loadAppSettings, APP_SETTINGS_EVENT } from '@/lib/appSettings';
import { setVoiceTier } from "@/lib/ttsVoice";

const PlanContext = createContext();

export function usePlan() {
  const context = useContext(PlanContext);
  if (!context) {
    throw new Error('usePlan must be used within PlanProvider');
  }
  return context;
}

export function PlanProvider({ children }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  // Admin-Schalter „alle Tools kostenlos“: gibt jedem jede Funktion frei,
  // ohne den gespeicherten Plan (und damit Werbung/Anzeige) zu verändern.
  const [allToolsFree, setAllToolsFree] = useState(false);
  const loadingRef = useRef(false);

  const loadPlan = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await Promise.race([
          functions.invoke('getPlanStatus'),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('getPlanStatus timeout')), 3000)
          ),
        ]);

        const payload = response?.data ?? response;
        if (payload?.plan) {
          setPlan(payload.plan);
        } else {
          setPlan({ id: 'free', name: 'Kostenlos', is_active: false });
        }
        setLoading(false);
        loadingRef.current = false;
        return;
      } catch (error) {
        if (error.message?.includes('Kein Token') && attempt < 2) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        setPlan({ id: 'free', name: 'Kostenlos', is_active: false });
        setLoading(false);
        loadingRef.current = false;
        return;
      }
    }
  }, []);

  useEffect(() => {
    loadPlan();
    window.addEventListener('plan-updated', loadPlan);
    return () => window.removeEventListener('plan-updated', loadPlan);
  }, [loadPlan]);

  // Bezahlte Google-Play-Käufe, die den Server nie erreicht haben, sowie
  // automatische Abo-Verlängerungen still nachziehen. Im Browser ohne
  // Play-Billing ist das ein No-op.
  useEffect(() => startGooglePlayReconciliation(), []);

  useEffect(() => {
    let active = true;
    const apply = (settings) => { if (active) setAllToolsFree(settings?.all_tools_free === true); };
    loadAppSettings().then(apply);
    const onUpdate = (event) => apply(event.detail);
    window.addEventListener(APP_SETTINGS_EVENT, onUpdate);
    return () => {
      active = false;
      window.removeEventListener(APP_SETTINGS_EVENT, onUpdate);
    };
  }, []);

  const hasFeature = (requiredPlan = 'basic') => {
    if (allToolsFree) return true;
    const currentPlanId = plan?.id || 'free';
    return planMeetsRequirement(currentPlanId, requiredPlan);
  };

  const basePlanLevel = getPlanLevel(plan?.id || 'free');
  const planLevel = allToolsFree ? Math.max(basePlanLevel, getPlanLevel('friends')) : basePlanLevel;

  // Sprachausgabe: Premium-Stimme ab Ultimate, darunter die Gerätestimme.
  useEffect(() => {
    setVoiceTier(planLevel >= getPlanLevel('elite') ? 'premium' : 'browser');
  }, [planLevel]);

  return (
    <PlanContext.Provider value={{ plan, loading, hasFeature, planLevel, allToolsFree, reload: loadPlan }}>
      {children}
    </PlanContext.Provider>
  );
}
