import { describe, it, expect } from 'vitest';
import {
  getAdCapabilities,
  isAdAllowedOnRoute,
  isAdAllowedInContext,
  AD_BLACKLIST_ROUTES,
  AD_BLACKLIST_CONTEXTS,
} from './adEntitlements';

describe('getAdCapabilities', () => {
  it('Gast (nicht eingeloggt) erhält nur Interstitials', () => {
    const caps = getAdCapabilities('free', false);
    expect(caps.interstitialAds).toBe(true);
    expect(caps.nativeAds).toBe(false);
    expect(caps.bannerAds).toBe(false);
    expect(caps.rewardedAds).toBe(false);
    expect(caps.adFree).toBe(false);
    expect(caps.tier).toBe('guest');
  });

  it('Free-Nutzer (eingeloggt, kein Plan) erhält native+banner+rewarded', () => {
    const caps = getAdCapabilities('free', true);
    expect(caps.interstitialAds).toBe(false);
    expect(caps.nativeAds).toBe(true);
    expect(caps.bannerAds).toBe(true);
    expect(caps.rewardedAds).toBe(true);
    expect(caps.adFree).toBe(false);
  });

  it('Basic erhält native+banner+rewarded, kein Interstitial', () => {
    const caps = getAdCapabilities('basic', true);
    expect(caps.interstitialAds).toBe(false);
    expect(caps.nativeAds).toBe(true);
    expect(caps.bannerAds).toBe(true);
    expect(caps.rewardedAds).toBe(true);
    expect(caps.adFree).toBe(false);
    expect(caps.tier).toBe('basic');
  });

  it('Pro ist vollständig werbefrei', () => {
    const caps = getAdCapabilities('pro', true);
    expect(caps.adFree).toBe(true);
    expect(caps.interstitialAds).toBe(false);
    expect(caps.nativeAds).toBe(false);
    expect(caps.bannerAds).toBe(false);
    expect(caps.rewardedAds).toBe(false);
    expect(caps.tier).toBe('premium');
  });

  it.each(['elite', 'ultimate', 'friends', 'friends_monthly', 'trial_10_10'])(
    'Plan "%s" ist vollständig werbefrei',
    (planId) => {
      const caps = getAdCapabilities(planId, true);
      expect(caps.adFree).toBe(true);
      expect(caps.interstitialAds).toBe(false);
    }
  );

  it('null-Plan (eingeloggt) wird als free behandelt', () => {
    const caps = getAdCapabilities(null, true);
    expect(caps.nativeAds).toBe(true);
  });
});

describe('isAdAllowedOnRoute', () => {
  it('Blacklist-Routen sperren Werbung', () => {
    for (const route of AD_BLACKLIST_ROUTES) {
      expect(isAdAllowedOnRoute(route)).toBe(false);
    }
  });

  it('reguläre Routen erlauben Werbung', () => {
    expect(isAdAllowedOnRoute('/Dashboard')).toBe(true);
    expect(isAdAllowedOnRoute('/CatchLog')).toBe(true);
    expect(isAdAllowedOnRoute('/Map')).toBe(true);
  });

  it('Query-String wird ignoriert', () => {
    expect(isAdAllowedOnRoute('/Login?redirect=/Dashboard')).toBe(false);
    expect(isAdAllowedOnRoute('/Dashboard?tab=spots')).toBe(true);
  });

  it('null/undefined gibt false zurück', () => {
    expect(isAdAllowedOnRoute(null)).toBe(false);
    expect(isAdAllowedOnRoute(undefined)).toBe(false);
    expect(isAdAllowedOnRoute('')).toBe(false);
  });
});

describe('isAdAllowedInContext', () => {
  it('leerer Kontext erlaubt Werbung', () => {
    expect(isAdAllowedInContext([])).toBe(true);
  });

  it('Blacklist-Kontexte sperren Werbung', () => {
    for (const ctx of AD_BLACKLIST_CONTEXTS) {
      expect(isAdAllowedInContext([ctx])).toBe(false);
    }
  });

  it('unbedenkliche Kontexte sperren nicht', () => {
    expect(isAdAllowedInContext(['idle', 'map_open'])).toBe(true);
  });

  it('ein gesperrter Kontext unter mehreren reicht', () => {
    expect(isAdAllowedInContext(['idle', 'voice_session'])).toBe(false);
  });
});
