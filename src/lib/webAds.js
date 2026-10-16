import { ADSENSE_CLIENT, ADSENSE_SLOT } from './adPublisher';

// Public AdSense identifiers; never API keys. Empty configuration serves no ads.
export function getWebAdConfig(env = import.meta.env) {
  const client = (env.VITE_ADSENSE_CLIENT ?? ADSENSE_CLIENT).trim();
  const slot = (env.VITE_ADSENSE_SLOT ?? ADSENSE_SLOT).trim();
  return /^ca-pub-\d{16}$/.test(client) && /^\d{10}$/.test(slot)
    ? { client, slot } : null;
}

let loading;
export function loadAdSense(client) {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
    script.onload = resolve;
    script.onerror = () => { script.remove(); loading = null; reject(new Error('AdSense unavailable')); };
    document.head.appendChild(script);
  });
  return loading;
}

// A certified CMP must expose TCF. No request before a completed CMP decision.
// Requiring explicit storage + Google vendor consent is deliberately conservative.
export function hasAdConsent(data, success) {
  return success === true && data?.cmpStatus === 'loaded'
    && ['tcloaded', 'useractioncomplete'].includes(data.eventStatus)
    && (data.gdprApplies === false || (data.gdprApplies === true
      && data.purpose?.consents?.[1] === true && data.vendor?.consents?.[755] === true));
}

export function subscribeAdConsent(callback) {
  let active = true;
  let api;
  let listenerId;
  const connect = () => {
    if (api || typeof window.__tcfapi !== 'function') return;
    api = window.__tcfapi;
    api('addEventListener', 2, (data, success) => {
      listenerId = data?.listenerId ?? listenerId;
      if (active) callback(hasAdConsent(data, success));
    });
  };
  connect();
  const timer = window.setInterval(connect, 500);
  return () => {
    active = false;
    window.clearInterval(timer);
    if (api && listenerId != null) api('removeEventListener', 2, () => {}, listenerId);
  };
}
