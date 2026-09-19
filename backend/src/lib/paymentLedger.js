import { createHash } from 'node:crypto';
import { supabase } from './supabase.js';
import { invalidateUserAuthCache } from '../middleware/auth.js';

// Tokens are bearer credentials. Only a hash belongs in the payment ledger.
export const receiptHash = (value) => createHash('sha256').update(value).digest('hex');
export async function applyPayment({ userId, provider, reference, planId, startsAt, expiresAt, observedAt, active = true, discountCents = 0, customerId = null, subscriptionId = null }) {
  const { data, error } = await supabase.rpc('apply_verified_payment', {
    p_user_id: userId, p_provider: provider, p_reference: receiptHash(reference),
    p_plan_id: planId, p_starts_at: startsAt, p_expires_at: expiresAt,
    p_observed_at: observedAt, p_active: active, p_discount_cents: discountCents,
    p_customer_id: customerId, p_subscription_id: subscriptionId,
  });
  if (error) {
    const failure = new Error(error.code === '23505' ? 'Kauf gehört bereits zu einem anderen Konto' : 'Zahlungsstatus konnte nicht sicher gespeichert werden');
    failure.status = error.code === '23505' ? 403 : 503;
    throw failure;
  }
  if (!data?.ok) throw Object.assign(new Error('Zahlungsstatus wurde nicht bestätigt'), { status: 503 });
  invalidateUserAuthCache(userId);
  return data;
}
