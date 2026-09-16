import React, { useState, useCallback, useRef, createContext, useContext, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePlan } from '@/components/premium/PlanContext';
import { useAuth } from '@/lib/AuthContext';
import { getAdCapabilities, isAdAllowedOnRoute, MAIN_TOOL_ROUTES } from '@/lib/adEntitlements';
import { canShowInterstitial, } from '@/components/ads/InterstitialAd';
import { getAdConfig, loadAdConfig } from '@/lib/adConfig';
import { trackAdEvent } from '@/lib/adAnalytics';

const AdGateContext = createContext(null);

/**
 * AdGate Provider — zentrales Ad-Routing.
 * Hält Ad-Capabilities, pending Interstitials und steuert
 * alle Ad-Entscheidungen zentral.
 */
export function AdGateProvider({ children }) {
  const { plan, loading: planLoading } = usePlan();
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [pendingInterstitial, setPendingInterstitial] = useState(null);
  const prevPathRef = useRef(location.pathname);
  const configRef = useRef(null);

  // Config laden
  useEffect(() => {
    loadAdConfig().then(cfg => { configRef.current = cfg; });
  }, []);

  const capabilities = React.useMemo(
    () => getAdCapabilities(plan?.id ?? 'free', isAuthenticated),
    [plan?.id, isAuthenticated]
  );

  // Interstitial-Guard bei Navigation
  useEffect(() => {
    if (planLoading) return;
    const currentPath = location.pathname;
    const previousPath = prevPathRef.current;
    prevPathRef.current = currentPath;

    // Nur Gäste mit Interstitials
    if (!capabilities.interstitialAds) return;
    if (!isAdAllowedOnRoute(currentPath)) return;
    if (!MAIN_TOOL_ROUTES.has(currentPath)) return;
    // Nur beim Wechsel zwischen Haupttools
    if (!MAIN_TOOL_ROUTES.has(previousPath) && previousPath !== currentPath) return;

    const cfg = configRef.current ?? getAdConfig();
    if (!cfg.guest_interstitial_enabled) return;
    if (!canShowInterstitial(cfg.guest_interstitial_cooldown_s ?? 120)) return;

    trackAdEvent('ad_requested', {
      ad_type: 'interstitial',
      source_tool: previousPath,
      target_tool: currentPath,
      user_plan: 'guest',
    });

    setPendingInterstitial({ sourceTool: previousPath, targetPath: currentPath });
  }, [location.pathname, capabilities.interstitialAds, planLoading]);

  const dismissInterstitial = useCallback(() => {
    setPendingInterstitial(null);
  }, []);

  return (
    <AdGateContext.Provider value={{ capabilities, pendingInterstitial, dismissInterstitial }}>
      {children}
    </AdGateContext.Provider>
  );
}

export function useAdGate() {
  const ctx = useContext(AdGateContext);
  if (!ctx) throw new Error('useAdGate must be used within AdGateProvider');
  return ctx;
}
