import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabase } from '../lib/supabase.js';
import { resolvePlan } from '../lib/planResolver.js';

const router = Router();

// ── Remote Config ────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  guest_interstitial_enabled: true,
  guest_interstitial_cooldown_s: 120,
  guest_interstitial_duration_s: 30,
  guest_interstitial_skip_after_s: 30,

  basic_native_enabled: true,
  basic_native_interval: 4,

  basic_banner_enabled: true,

  basic_rewarded_enabled: true,
  basic_rewarded_rewards: ['ki_analyse', 'ki_voice_30min', 'satellite', 'premium_tool_1h'],

  pro_ads_enabled: false,
  ultimate_ads_enabled: false,
  day_pass_ads_enabled: false,
  trial_ads_enabled: false,
};

// Optionale DB-Overrides über eine app_config-Tabelle, falls vorhanden.
// Bei Fehler: Defaults verwenden (fail-open).
async function getConfig() {
  try {
    const { data } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'ad_config')
      .single();
    if (data?.value) return { ...DEFAULT_CONFIG, ...data.value };
  } catch {
    // ignorieren
  }
  return DEFAULT_CONFIG;
}

// GET /api/ads/config — öffentlich (kein Auth nötig)
router.get('/config', async (_req, res) => {
  const cfg = await getConfig();
  res.json(cfg);
});

// ── Analytics (fire-and-forget) ──────────────────────────────────────────────

const VALID_EVENTS = new Set([
  'ad_requested', 'ad_loaded', 'ad_started', 'ad_completed',
  'ad_failed', 'ad_clicked', 'ad_skipped',
  'rewarded_ad_started', 'rewarded_ad_completed',
  'reward_granted', 'reward_failed',
  'native_ad_impression', 'native_ad_clicked',
  'banner_impression', 'banner_clicked',
]);

// POST /api/ads/event — kein Auth, immer 204 (fire-and-forget)
router.post('/event', async (req, res) => {
  const { event, ts, ...meta } = req.body ?? {};
  res.status(204).end();

  if (!VALID_EVENTS.has(event)) return;

  // Async in DB schreiben ohne den Client zu blockieren
  try {
    await supabase.from('ad_events').insert({
      event,
      ts: ts ? new Date(ts).toISOString() : new Date().toISOString(),
      meta,
    });
  } catch {
    // ignorieren — Analytics darf nie die App blockieren
  }
});

// ── Reward-Erteilung (serverseitig) ─────────────────────────────────────────

const REWARD_DURATIONS = {
  ki_analyse:      { type: 'count',    field: 'rewarded_ki_analyse_count',       amount: 1       },
  ki_voice_30min:  { type: 'duration', field: 'rewarded_ki_voice_expires_at',     minutes: 30     },
  satellite:       { type: 'count',    field: 'rewarded_satellite_count',         amount: 1       },
  premium_tool_1h: { type: 'duration', field: 'rewarded_premium_tool_expires_at', minutes: 60     },
};

// POST /api/ads/reward/complete — requires auth
// Body: { reward_type: string }
// Sicherheitsregel: nur der Server erteilt Rewards — kein Frontend-Wert
// wird direkt übernommen.
router.post('/reward/complete', requireAuth, async (req, res) => {
  const { reward_type } = req.body ?? {};
  const rewardDef = REWARD_DURATIONS[reward_type];

  if (!rewardDef) {
    return res.status(400).json({ error: 'Unbekannter Reward-Typ' });
  }

  // Plan prüfen — nur Basic/Free darf Rewarded Ads nutzen, Pro+ ist werbefrei
  const user = req.user;
  const plan = resolvePlan(user);
  const adFreePlans = new Set(['pro', 'elite', 'ultimate', 'friends', 'friends_monthly', 'trial_10_10']);
  if (adFreePlans.has(plan.effectiveId)) {
    // Pro+-Nutzer brauchen keinen Reward — trotzdem 200 (kein Fehler für den Nutzer)
    return res.json({ granted: false, reason: 'already_premium' });
  }

  // Config prüfen ob Rewarded Ads aktiv
  const cfg = await getConfig();
  if (!cfg.basic_rewarded_enabled) {
    return res.status(503).json({ error: 'Rewarded Ads momentan nicht verfügbar' });
  }

  // Reward auf User-Metadaten schreiben
  const { data: userData, error: fetchErr } = await supabase.auth.admin.getUserById(user.id);
  if (fetchErr || !userData?.user) {
    return res.status(500).json({ error: 'Nutzer nicht gefunden' });
  }

  const meta = userData.user.user_metadata ?? {};
  const updatedMeta = { ...meta };

  if (rewardDef.type === 'count') {
    updatedMeta[rewardDef.field] = (Number(meta[rewardDef.field] ?? 0)) + rewardDef.amount;
  } else if (rewardDef.type === 'duration') {
    const existing = meta[rewardDef.field] ? new Date(meta[rewardDef.field]) : null;
    const base = existing && existing > new Date() ? existing : new Date();
    base.setMinutes(base.getMinutes() + rewardDef.minutes);
    updatedMeta[rewardDef.field] = base.toISOString();
  }

  const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: updatedMeta,
  });

  if (updateErr) {
    return res.status(500).json({ error: 'Reward konnte nicht gespeichert werden' });
  }

  // Analytics-Event (fire-and-forget)
  supabase.from('ad_events').insert({
    event: 'reward_granted',
    ts: new Date().toISOString(),
    meta: { reward_type, user_id: user.id, plan: plan.effectiveId },
  }).catch(() => {});

  return res.json({ granted: true, reward_type, updated_meta: updatedMeta });
});

export default router;
