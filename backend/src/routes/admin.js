import { Router } from 'express';
import { supabase } from '../lib/supabase.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { listAllUsers } from '../lib/adminUsers.js';
import { assignPlan } from '../lib/planAssignment.js';
import { sendDbError } from '../lib/errorResponse.js';

const router = Router();

// CRON_SECRET wird pro Anfrage geprüft, nicht beim Modul-Import. Früher warf
// admin.js beim Import, wenn die Variable fehlte — da server.js alle Routen
// importiert, startete dann das GESAMTE Backend nicht (Login, Fangbuch, KI …),
// nur weil ein Cron-Secret fehlte. Jetzt sind ausschließlich die Cron-Routen
// gesperrt (fail-closed), wie bei den Cron-Routen in events.js.
function requireCronAuth(req, res, next) {
  const ADMIN_SECRET = process.env.CRON_SECRET;
  if (!ADMIN_SECRET) {
    console.error('[admin] CRON_SECRET ist nicht gesetzt — Cron-Routen gesperrt');
    return res.status(500).json({ error: 'Cron-Secret nicht konfiguriert' });
  }
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
          console.log(`[admin] Plan abgelaufen für User ${user.id}: ${planId}`);
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
router.post('/admin/plans/assign', requireAuth, requireAdmin, async (req, res) => {
  const { target_user_id, plan_id, duration_days } = req.body || {};
  const result = await assignPlan({
    targetUserId: target_user_id,
    planId: plan_id,
    durationDays: duration_days,
    assignedBy: req.user.email,
  });
  if (result.error) return sendDbError(res, result.error);
  return res.status(result.status).json(result.body);
});

export default router;
