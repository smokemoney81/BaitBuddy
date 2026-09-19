import { getStripeClient } from './purchaseVerification.js';
import { BILLING_PLANS, canonicalPlanId, checkoutAmount } from '../../../shared/billingCatalog.js';
import { supabase } from './supabase.js';
import { applyPayment } from './paymentLedger.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const idOf = (object) => typeof object === 'string' ? object : object?.id;
export function billingOrigin() {
  const url = new URL(process.env.APP_BASE_URL);
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) throw fail('APP_BASE_URL ist ungültig', 503);
  return url.origin;
}
export function stripeReady(planId) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET || !process.env.APP_BASE_URL) return false;
  try { billingOrigin(); } catch { return false; }
  const plan = BILLING_PLANS[canonicalPlanId(planId)];
  return Boolean(plan?.amountCents && (!plan.interval || process.env[plan.priceEnv]));
}

export async function openStripeCheckout(user, requestedPlan) {
  const planId = canonicalPlanId(requestedPlan);
  const plan = BILLING_PLANS[planId];
  if (!plan?.amountCents || plan.legacy) throw fail('Unbekannter oder nicht mehr angebotener Tarif');
  if (!stripeReady(planId)) throw fail('Zahlungsweg ist für diesen Tarif nicht vollständig eingerichtet', 503);
  const { error: ledgerError } = await supabase.from('verified_payments').select('reference').limit(0);
  if (ledgerError) throw fail('Kaufabwicklung ist noch nicht vollständig eingerichtet', 503);
  const stripe = getStripeClient();
  const origin = billingOrigin();
  // Idempotent customer creation prevents double subscriptions across devices.
  const customerId = user.app_metadata?.stripe_customer_id || (await stripe.customers.create(
    { metadata: { user_id: user.id } }, { idempotencyKey: `baitbuddy-customer-${user.id}` }
  )).id;
  const { error: customerError } = await supabase.auth.admin.updateUserById(user.id, { app_metadata: { stripe_customer_id: customerId } });
  if (customerError) throw fail('Zahlungskonto konnte nicht gespeichert werden', 503);
  if (plan.interval) {
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
    if (subscriptions.has_more || subscriptions.data.some((s) => !['canceled','incomplete_expired'].includes(s.status))) {
      throw fail('Ein Abo besteht bereits. Bitte nutze „Abo verwalten“ für einen Tarifwechsel.', 409);
    }
  }
  const sessions = await stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 100 });
  const open = sessions.data.find((s) => s.metadata?.plan_id === planId);
  if (open) return { ok: true, checkout_url: open.url, session_id: open.id };
  if (sessions.data.length || sessions.has_more) throw fail('Ein Checkout ist bereits offen. Schließe ihn ab oder warte bis zu seinem Ablauf.', 409);
  const total = checkoutAmount(planId, user.app_metadata?.ultimate_discount_cents);
  const discount = plan.amountCents - total;
  const metadata = { user_id: user.id, plan_id: planId, discount_cents: String(discount) };
  let discounts;
  if (discount) {
    const coupon = await stripe.coupons.create({ amount_off: discount, currency: 'eur', duration: 'once', name: 'BaitBuddy Freundschafts-Rabatt' },
      { idempotencyKey: `baitbuddy-discount-${user.id}-${discount}` });
    discounts = [{ coupon: coupon.id }];
  }
  const params = {
    mode: plan.interval ? 'subscription' : 'payment', customer: customerId,
    integration_identifier: 'baitbuddy_checkout_qrtsvwxz',
    client_reference_id: user.id, metadata,
    line_items: [{ quantity: 1, ...(plan.interval ? { price: process.env[plan.priceEnv] } : {
      price_data: { currency: 'eur', unit_amount: plan.amountCents, product_data: { name: `BaitBuddy ${plan.name}` } },
    }) }],
    ...(plan.interval ? { subscription_data: { metadata } } : {}),
    ...(discounts ? { discounts } : {}),
    success_url: `${origin}/PremiumPlans?checkout=success&plan_id=${planId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/PremiumPlans?checkout=cancelled`,
  };
  // Same customer + time slot across ALL plans: simultaneous tabs cannot create
  // two differently priced sessions (Stripe rejects conflicting parameters).
  const slot = Math.floor(Date.now() / (30 * 60 * 1000));
  const session = await stripe.checkout.sessions.create(params, { idempotencyKey: `baitbuddy-checkout-${customerId}-${slot}` });
  return { ok: true, checkout_url: session.url, session_id: session.id };
}

export async function openBillingPortal(user) {
  const customer = user.app_metadata?.stripe_customer_id;
  if (!customer) throw fail('Für dieses Konto wurde noch kein Web-Abo angelegt', 404);
  const session = await getStripeClient().billingPortal.sessions.create({ customer, return_url: `${billingOrigin()}/PremiumPlans`, ...(process.env.STRIPE_PORTAL_CONFIGURATION ? { configuration: process.env.STRIPE_PORTAL_CONFIGURATION } : {}) });
  return { ok: true, url: session.url };
}

export async function syncStripeSubscription(subscriptionId, expectedUserId) {
  const observedAt = new Date().toISOString();
  // Retrieve current provider state even for old/out-of-order webhook events.
  const sub = await getStripeClient().subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
  const userId = sub.metadata?.user_id;
  if (!userId || (expectedUserId && userId !== expectedUserId)) throw fail('Zahlung gehört nicht zu diesem Konto', 403);
  const items = sub.items?.data || [];
  if (items.length !== 1) throw fail('Unbekannte Abo-Positionen', 422);
  const item = items[0];
  const planId = Object.keys(BILLING_PLANS).find((id) => BILLING_PLANS[id].priceEnv && process.env[BILLING_PLANS[id].priceEnv] === item.price.id);
  if (!planId) throw fail('Unbekannter Stripe-Tarif', 422);
  const start = item.current_period_start ?? sub.current_period_start;
  const end = item.current_period_end ?? sub.current_period_end;
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw fail('Abo-Laufzeit fehlt', 422);
  // An unpaid upgrade must not grant the higher plan. A paid invoice also
  // covers zero-due invoices; trialing is intentionally not offered here.
  const paid = sub.latest_invoice?.status === 'paid';
  if (['active','past_due'].includes(sub.status) && !paid) {
    return { ok: true, updated: false, userId, planId, active: false };
  }
  const active = sub.status === 'active' && paid;
  const result = await applyPayment({
    userId, provider: 'stripe', reference: sub.id, planId,
    startsAt: new Date(start * 1000).toISOString(), expiresAt: new Date(end * 1000).toISOString(),
    observedAt, active, customerId: idOf(sub.customer), subscriptionId: sub.id,
    discountCents: active ? Number(sub.metadata?.discount_cents || 0) : 0,
  });
  return { ...result, userId, planId, active };
}

export async function fulfillStripeSession(sessionId, expectedUserId, expectedPlanId) {
  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const userId = session.client_reference_id;
  const planId = canonicalPlanId(session.metadata?.plan_id);
  if (!userId || session.metadata?.user_id !== userId || (expectedUserId && userId !== expectedUserId)) throw fail('Zahlung gehört nicht zu diesem Konto', 403);
  if (!BILLING_PLANS[planId] || (expectedPlanId && planId !== canonicalPlanId(expectedPlanId))) throw fail('Zahlung gehört nicht zu diesem Tarif');
  if (session.status !== 'complete' || session.payment_status !== 'paid') throw fail('Zahlung noch nicht bestätigt', 402);
  if (session.mode === 'subscription') {
    const result = await syncStripeSubscription(idOf(session.subscription), userId);
    if (!result.active) throw fail('Abo noch nicht aktiv', 402);
    return result;
  }
  // Supports existing one-time sessions without silently turning old purchases
  // into subscriptions. Their original creation time fixes the expiry on replay.
  const plan = BILLING_PLANS[planId];
  if (session.currency !== 'eur' || session.amount_total !== checkoutAmount(planId, Number(session.metadata?.discount_cents || 0))) throw fail('Zahlungsbetrag stimmt nicht mit dem Tarif überein', 422);
  if (session.mode !== 'payment') throw fail('Unbekannter Zahlungsmodus', 422);
  const start = Date.now(); // The ledger fixes first fulfillment time across all replays.
  const hours = plan.durationHours || (plan.interval === 'year' ? 365 * 24 : 30 * 24);
  return applyPayment({ userId, provider: 'stripe', reference: session.id, planId,
    startsAt: new Date(start).toISOString(), expiresAt: new Date(start + hours * 3600000).toISOString(),
    observedAt: new Date().toISOString(), customerId: idOf(session.customer),
    discountCents: Number(session.metadata?.discount_cents || 0),
  });
}

export async function processStripeEvent(event) {
  const object = event.data.object;
  if (['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) {
    if (object.payment_status !== 'paid') return { received: true };
    await fulfillStripeSession(object.id);
  } else if (event.type.startsWith('customer.subscription.')) {
    await syncStripeSubscription(object.id);
  } else if (['invoice.paid','invoice.payment_failed','invoice.payment_action_required'].includes(event.type)) {
    const subscription = idOf(object.parent?.subscription_details?.subscription || object.subscription);
    if (subscription) await syncStripeSubscription(subscription);
  }
  return { received: true };
}
