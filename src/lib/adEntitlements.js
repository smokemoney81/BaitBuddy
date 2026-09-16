// Zentrale Ad-Capabilities — Spiegel der Werbelogik aus SKILL.md.
// Quelle der Wahrheit ist immer der Backend-Plan (PlanContext),
// nie ein direkt vom Client manipulierbarer Wert.
//
// Gast (nicht eingeloggt):       interstitialAds
// Free / Basic (eingeloggt):     nativeAds + bannerAds + rewardedAds
// Pro / Ultimate / Pass / Trial: keine Werbung

// Diese Liste enthält alle Main-Tools, zwischen denen beim Gast
// ein Interstitial erscheint (pro Navigation-Hop).
export const MAIN_TOOL_ROUTES = new Set([
  '/Dashboard',
  '/CatchLog',
  '/Map',
  '/Community',
  '/Weather',
  '/Trips',
  '/Gear',
  '/Recipes',
  '/Events',
  '/Analysis',
]);

// Routen, auf denen absolut keine Werbung erscheinen darf.
export const AD_BLACKLIST_ROUTES = new Set([
  '/Login',
  '/Register',
  '/AuthCallback',
  '/ResetPassword',
  '/Checkout',
  '/PremiumPlans',
  '/Onboarding',
  '/AnglerMode',
  '/KiBuddyBeta',
  '/CatchCam',
  '/ARView',
  '/ARKnotenAssistent',
  '/DeviceIntegration',
]);

// Feature-Kontexte, die laufende Sessions darstellen — kein Ad darf sie unterbrechen.
export const AD_BLACKLIST_CONTEXTS = new Set([
  'voice_session',
  'camera_active',
  'fish_recognition',
  'gear_recognition',
  'bite_detector',
  'ar_mode',
  'analysis_running',
  'catch_saving',
  'trip_saving',
  'checkout',
]);

/**
 * Berechnet Ad-Capabilities aus Plan-ID und Auth-Status.
 * Sicherheitsregel: Diese Funktion darf niemals vom Client überschrieben werden.
 * Capabilities werden von PlanContext aus Backend-Daten abgeleitet.
 *
 * @param {string|null} planId — Plan-ID vom Backend
 * @param {boolean} isAuthenticated — ob ein bb_token vorhanden ist
 * @returns {AdCapabilities}
 */
export function getAdCapabilities(planId, isAuthenticated) {
  const id = planId ?? 'free';

  // Gast (kein Token) → nur Interstitials
  if (!isAuthenticated) {
    return {
      interstitialAds: true,
      nativeAds: false,
      bannerAds: false,
      rewardedAds: false,
      adFree: false,
      tier: 'guest',
    };
  }

  // Pro / Ultimate / Friends / Trial / Pass → vollständig werbefrei
  const adFreePlans = new Set(['pro', 'elite', 'ultimate', 'friends', 'friends_monthly', 'trial_10_10']);
  if (adFreePlans.has(id)) {
    return {
      interstitialAds: false,
      nativeAds: false,
      bannerAds: false,
      rewardedAds: false,
      adFree: true,
      tier: 'premium',
    };
  }

  // Basic / Free (eingeloggt ohne bezahlten Plan) → dezente Werbung
  return {
    interstitialAds: false,
    nativeAds: true,
    bannerAds: true,
    rewardedAds: true,
    adFree: false,
    tier: id === 'basic' ? 'basic' : 'free',
  };
}

/**
 * Prüft, ob auf einer Route Werbung erlaubt ist.
 */
export function isAdAllowedOnRoute(pathname) {
  if (!pathname) return false;
  const clean = pathname.split('?')[0];
  return !AD_BLACKLIST_ROUTES.has(clean);
}

/**
 * Prüft, ob ein aktiver Kontext Werbung sperrt.
 */
export function isAdAllowedInContext(activeContexts = []) {
  for (const ctx of activeContexts) {
    if (AD_BLACKLIST_CONTEXTS.has(ctx)) return false;
  }
  return true;
}
