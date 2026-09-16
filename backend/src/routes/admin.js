import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { listAllUsers } from '../lib/adminUsers.js';
import { PLAN_RANK } from '../lib/planResolver.js';
import { sendDbError } from '../lib/errorResponse.js';
import logger from '../lib/logger.js';

const router = Router();

const ADMIN_SECRET = process.env.CRON_SECRET;
if (!ADMIN_SECRET) {
  throw new Error(
    'CRON_SECRET environment variable is required for admin routes. ' +
    'Set it in Vercel Environment Variables or .env.production (never commit)'
  );
}

function requireCronAuth(req, res, next) {
  // Drei akzeptierte Wege, damit ALLE Cron-Ausloeser denselben Endpunkt treffen:
  // - x-cron-secret Header (manuelle/eigene Aufrufe)
  // - ?secret= Query
  // - Authorization: Bearer <secret> (Vercel-Crons, Docker-Cron und der
  //   Cloudflare-Cron-Worker senden diesen Header). Frueher pruefte diese Route
  //   NUR x-cron-secret, waehrend Vercel/Docker Bearer schickten — der
  //   check-expiry-Cron lief dadurch dauerhaft in 401.
  const authHeader = req.get('authorization') || '';
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
  const secret = req.get('x-cron-secret') || req.query.secret || bearer;
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  next();
}

router.get('/admin/premium/check-expiry', requireCronAuth, async (req, res) => {
  try {
    const now = new Date().toISOString();

    // listAllUsers packt die Supabase-Antwort korrekt aus und blättert über
    // alle Seiten — vorher lief hier ein `for ... of` über das Wrapper-Objekt
    // und der Cron endete bei jedem Lauf im 500er.
    const { users, error } = await listAllUsers(supabase);
    if (error) {
      console.error('[admin] listUsers fehlgeschlagen:', error);
      return res.status(500).json({ error: 'Benutzer-Listing fehlgeschlagen' });
    }

    let expiredCount = 0;
    for (const user of users) {
      const meta = user.app_metadata || {};
      const expiresAt = meta.premium_expires_at;
      const planId = meta.premium_plan_id;

      if (!planId || !expiresAt) continue;

      if (new Date(expiresAt) < new Date(now)) {
        const currentVersion = meta.premium_check_expiry_version || 0;
        const nextVersion = currentVersion + 1;

        const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
          app_metadata: {
            ...meta,
            premium_plan_id: null,
            premium_expires_at: null,
            premium_trial: null,
            premium_check_expiry_version: nextVersion,
          },
        });

        if (!updateError) {
          expiredCount++;
          logger.info(`Plan abgelaufen für User ${user.id}: ${planId}`);
        } else {
          console.error(`[admin] Fehler beim Reset für User ${user.id}:`, updateError);
        }
      }
    }

    return res.json({
      ok: true,
      message: `${expiredCount} abgelaufene Pläne zurückgesetzt`,
      checked: users.length,
      expired: expiredCount,
    });
  } catch (e) {
    console.error('[admin] check-expiry Fehler:', e?.message || e);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

// POST /api/admin/plans/assign — Plan manuell zuweisen (Support-Fälle,
// Gewinnspiele, Testkonten). Der Endpunkt fehlte komplett: die Admin-Oberfläche
// rief ihn auf, der Client schluckte den 404 und lieferte ein erfundenes
// { ok: true } zurück — die Zuweisung passierte nie.
//
// Zulässige Plan-IDs kommen aus derselben Rangtabelle wie das übrige
// Feature-Gating; 'free' entzieht den Plan.
const ASSIGNABLE_PLANS = new Set([...Object.keys(PLAN_RANK), 'free']);
const MAX_DURATION_DAYS = 3650;

router.post('/admin/plans/assign', requireAuth, requireAdmin, async (req, res) => {
  const { target_user_id, plan_id, duration_days } = req.body || {};

  if (!target_user_id || typeof target_user_id !== 'string') {
    return res.status(400).json({ error: 'target_user_id erforderlich' });
  }
  if (!plan_id || !ASSIGNABLE_PLANS.has(plan_id)) {
    return res.status(400).json({ error: 'Unbekannte oder fehlende plan_id' });
  }

  const days = Number(duration_days ?? 30);
  if (!Number.isFinite(days) || days < 1 || days > MAX_DURATION_DAYS) {
    return res.status(400).json({ error: `duration_days muss zwischen 1 und ${MAX_DURATION_DAYS} liegen` });
  }

  // Bestehende Metadaten laden und mergen — updateUserById ersetzt
  // user_metadata komplett, ein Teil-Objekt würde Profil, Einstellungen und
  // Referral-Daten des Nutzers löschen.
  const { data: found, error: loadError } = await supabase.auth.admin.getUserById(target_user_id);
  if (loadError) return sendDbError(res, loadError);
  const targetUser = found?.user;
  if (!targetUser) return res.status(404).json({ error: 'Benutzer nicht gefunden' });

  const current = targetUser.app_metadata || {};
  const isRevoke = plan_id === 'free';

  const merged = {
    ...current,
    premium_plan_id: isRevoke ? 'free' : plan_id,
    premium_expires_at: isRevoke
      ? null
      : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
    premium_trial: false,
    premium_payment_method: isRevoke ? null : 'admin',
    premium_activated_at: new Date().toISOString(),
    premium_activation_version: (current.premium_activation_version || 0) + 1,
    // Nachvollziehbarkeit: wer hat den Plan von Hand gesetzt.
    premium_assigned_by: req.user.email,
  };

  const { error: updateError } = await supabase.auth.admin.updateUserById(target_user_id, {
    app_metadata: merged,
  });
  if (updateError) return sendDbError(res, updateError);

  logger.info(`${req.user.email} hat ${targetUser.email} den Plan "${merged.premium_plan_id}" zugewiesen`);

  return res.json({
    ok: true,
    plan_id: merged.premium_plan_id,
    expires_at: merged.premium_expires_at,
    user_email: targetUser.email || null,
  });
});

export default router;
