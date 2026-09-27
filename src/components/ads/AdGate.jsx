import React, { useState, useCallback, useRef, createContext, useContext, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usePlan } from '@/components/premium/PlanContext';
import { useAuth } from '@/lib/AuthContext';
import { getAdCapabilities, isAdAllowedOnRoute, isAdAllowedInContext, MAIN_TOOL_ROUTES } from '@/lib/adEntitlements';
import { canShowInterstitial, } from '@/components/ads/InterstitialAd';
import { getAdConfig, loadAdConfig } from '@/lib/adConfig';
import { trackAdEvent } from '@/lib/adAnalytics';
import { APP_SETTINGS_EVENT } from '@/lib/appSettings';
import { getActiveAdContexts, subscribeAdContexts } from '@/lib/adActiveContext';

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
  // Verhindert eine Werbeanzeige unmittelbar beim App-Start: Ohne dieses Flag
  // war previousPath beim allerersten Effect-Lauf identisch zu currentPath,
  // wodurch der "nur beim Wechsel zwischen Haupttools"-Guard unten (der genau
  // diesen Fall ausschließen soll) wirkungslos war und ein Gast, der per
  // Deep-Link direkt auf einer Haupttool-Route landete, sofort ein
  // Interstitial sah — die App muss aber zuerst normal öffnen.
  const hasNavigatedRef = useRef(false);
  const configRef = useRef(null);
  // Hauptschalter aus dem Admin-Bereich (/api/ads/config → ads_enabled).
  const [adsEnabled, setAdsEnabled] = useState(() => getAdConfig().ads_enabled !== false);
  // Laufende, nicht unterbrechbare Sessions (Drill/Bisserkennung, Kamera,
  // Sprachausgabe …) melden sich über setAdContextActive an — unabhängig von
  // der Route, z.B. wenn die Bisserkennung auf einer sonst unauffälligen Seite läuft.
  const [activeAdContexts, setActiveAdContexts] = useState(() => getActiveAdContexts());

  useEffect(() => subscribeAdContexts(setActiveAdContexts), []);

  // Config laden
  useEffect(() => {
    let active = true;
    loadAdConfig().then(cfg => {
      configRef.current = cfg;
      if (active) setAdsEnabled(cfg.ads_enabled !== false);
    });
    // Schaltet der Superuser um, gilt es auf seinem Gerät sofort.
    const onSettings = (event) => {
      if (typeof event.detail?.ads_enabled === 'boolean') setAdsEnabled(event.detail.ads_enabled);
    };
    window.addEventListener(APP_SETTINGS_EVENT, onSettings);
    return () => {
      active = false;
      window.removeEventListener(APP_SETTINGS_EVENT, onSettings);
    };
  }, []);

  const capabilities = React.useMemo(
    () => getAdCapabilities(plan?.id ?? 'free', isAuthenticated, { adsEnabled }),
    [plan?.id, isAuthenticated, adsEnabled]
  );

  // Interstitial-Guard bei Navigation
  useEffect(() => {
    if (planLoading) return;
    const currentPath = location.pathname;
    const previousPath = prevPathRef.current;
    prevPathRef.current = currentPath;

    // Erster Lauf nach App-Start: keine echte Navigation, also kein Interstitial.
    if (!hasNavigatedRef.current) {
      hasNavigatedRef.current = true;
      return;
    }

    // Nur Gäste mit Interstitials
    if (!capabilities.interstitialAds) return;
    if (!isAdAllowedOnRoute(currentPath)) return;
    if (!isAdAllowedInContext(activeAdContexts)) return;
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
  }, [location.pathname, capabilities.interstitialAds, planLoading, activeAdContexts]);

  const dismissInterstitial = useCallback(() => {
    setPendingInterstitial(null);
  }, []);

  // Banner sollen zusätzlich zur Plan-Berechtigung Route- und Kontext-Blacklist
  // respektieren (vorher prüfte der Banner-Slot nur capabilities.bannerAds).
  const bannerAllowed = capabilities.bannerAds
    && isAdAllowedOnRoute(location.pathname)
    && isAdAllowedInContext(activeAdContexts);

  return (
    <AdGateContext.Provider value={{ capabilities, bannerAllowed, pendingInterstitial, dismissInterstitial }}>
      {children}
    </AdGateContext.Provider>
  );
}

export function useAdGate() {
  const ctx = useContext(AdGateContext);
  if (!ctx) throw new Error('useAdGate must be used within AdGateProvider');
  return ctx;
}
