// Plan von Hand zuweisen oder entziehen (Admin-Werkzeuge).
// Genutzt von POST /api/admin/plans/assign (ADMIN_EMAILS) und
// POST /api/superadmin/users/:id/plan (Admin-Bereich des Superusers).
//
// Plan-Felder liegen ausschließlich in app_metadata — nur dort liest
// resolvePlan sie (user_metadata ist clientseitig beschreibbar).
import { supabase } from './supabase.js';
import { PLAN_RANK } from './planResolver.js';
import { invalidateCachedUser } from '../middleware/auth.js';

// 'free' entzieht den Plan.
export const ASSIGNABLE_PLANS = new Set([...Object.keys(PLAN_RANK), 'free']);
export const MAX_DURATION_DAYS = 3650;

// Liefert { status, body } — der Aufrufer schickt es nur noch weiter.
export async function assignPlan({ targetUserId, planId, durationDays, assignedBy }) {
  if (!targetUserId || typeof targetUserId !== 'string') {
    return { status: 400, body: { error: 'target_user_id erforderlich' } };
  }
  if (!planId || !ASSIGNABLE_PLANS.has(planId)) {
    return { status: 400, body: { error: 'Unbekannte oder fehlende plan_id' } };
  }
  const days = Number(durationDays ?? 30);
  if (!Number.isFinite(days) || days < 1 || days > MAX_DURATION_DAYS) {
    return { status: 400, body: { error: `duration_days muss zwischen 1 und ${MAX_DURATION_DAYS} liegen` } };
  }

  // Frischer Stand direkt aus GoTrue: updateUserById ersetzt app_metadata
  // komplett, ein Merge auf veralteten Daten würde Kauf-/Referral-Felder löschen.
  const { data: found, error: loadError } = await supabase.auth.admin.getUserById(targetUserId);
  if (loadError) return { status: 500, error: loadError };
  const targetUser = found?.user;
  if (!targetUser) return { status: 404, body: { error: 'Benutzer nicht gefunden' } };

  const current = targetUser.app_metadata || {};
  const isRevoke = planId === 'free';
  const merged = {
    ...current,
    premium_plan_id: isRevoke ? 'free' : planId,
    premium_expires_at: isRevoke ? null : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
    premium_trial: false,
    premium_payment_method: isRevoke ? null : 'admin',
    premium_activated_at: new Date().toISOString(),
    premium_activation_version: (current.premium_activation_version || 0) + 1,
    // Nachvollziehbarkeit: wer hat den Plan von Hand gesetzt.
    premium_assigned_by: assignedBy || null,
  };

  const { error: updateError } = await supabase.auth.admin.updateUserById(targetUserId, { app_metadata: merged });
  if (updateError) return { status: 500, error: updateError };
  // Sonst sieht der Nutzer den neuen Plan erst nach Ablauf des Token-Caches (bis 60 s).
  invalidateCachedUser(targetUserId);

  console.log(`[admin] ${assignedBy} hat ${targetUser.email} den Plan "${merged.premium_plan_id}" zugewiesen`);

  return {
    status: 200,
    body: {
      ok: true,
      plan_id: merged.premium_plan_id,
      expires_at: merged.premium_expires_at,
      user_email: targetUser.email || null,
    },
    user: { ...targetUser, app_metadata: merged },
  };
}
