// Ad-Analytics — feuert Events an /api/ads/event (fire-and-forget).
// Bei Fehler: still verwerfen, App nicht blockieren.

const VALID_EVENTS = new Set([
  'ad_requested', 'ad_loaded', 'ad_started', 'ad_completed',
  'ad_failed', 'ad_clicked', 'ad_skipped',
  'rewarded_ad_started', 'rewarded_ad_completed',
  'reward_granted', 'reward_failed',
  'native_ad_impression', 'native_ad_clicked',
  'banner_impression', 'banner_clicked',
]);

/**
 * @param {string} eventName
 * @param {Record<string, unknown>} [meta]
 */
export function trackAdEvent(eventName, meta = {}) {
  if (!VALID_EVENTS.has(eventName)) return;
  const payload = {
    event: eventName,
    ts: Date.now(),
    ...meta,
  };
  // Fire-and-forget — kein await, kein Fehler nach außen
  fetch('/api/ads/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
