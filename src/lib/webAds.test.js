import { describe, it, expect } from 'vitest';
import { getWebAdConfig, hasAdConsent } from './webAds';

describe('web ad configuration', () => {
  it('rejects explicitly disabled, malformed and native AdMob identifiers', () => {
    for (const env of [{ VITE_ADSENSE_SLOT: '' }, { VITE_ADSENSE_SLOT: 'invalid' }, { VITE_ADSENSE_CLIENT: 'ca-app-pub-1234567890123456', VITE_ADSENSE_SLOT: '1234567890' }]) {
      expect(getWebAdConfig(env)).toBeNull();
    }
    expect(getWebAdConfig({ VITE_ADSENSE_CLIENT: 'ca-pub-1234567890123456', VITE_ADSENSE_SLOT: '1234567890' })).toEqual({ client: 'ca-pub-1234567890123456', slot: '1234567890' });
  });
  it('uses the owner publisher ID when only a slot is supplied', () => {
    expect(getWebAdConfig({ VITE_ADSENSE_SLOT: '1234567890' })).toEqual({ client: 'ca-pub-8135212085624241', slot: '1234567890' });
  });
  it('uses both owner-supplied identifiers without environment setup', () => {
    expect(getWebAdConfig({})).toEqual({ client: 'ca-pub-8135212085624241', slot: '7915506191' });
  });
  it('requires completed CMP and explicit applicable consent', () => {
    const data = { cmpStatus: 'loaded', eventStatus: 'useractioncomplete', gdprApplies: true, purpose: { consents: { 1: true } }, vendor: { consents: { 755: true } } };
    expect(hasAdConsent(data, true)).toBe(true);
    expect(hasAdConsent(data, false)).toBe(false);
    expect(hasAdConsent({ ...data, eventStatus: 'cmpuishown' }, true)).toBe(false);
    expect(hasAdConsent({ ...data, vendor: {} }, true)).toBe(false);
    expect(hasAdConsent({ ...data, gdprApplies: undefined }, true)).toBe(false);
    expect(hasAdConsent({ ...data, gdprApplies: false, vendor: {} }, true)).toBe(true);
  });
});
