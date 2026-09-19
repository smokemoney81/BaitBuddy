// Canonical identifiers: provider aliases are normalized only at the boundary.
export const canonicalPlanId = (id) => id === 'ultimate' ? 'elite' : id;
export const BILLING_PLANS = Object.freeze({
  basic: { name: 'Basic', amountCents: 899, interval: 'month', priceEnv: 'STRIPE_PRICE_BASIC', playProduct: 'baitbuddy_basic_monthly' },
  pro: { name: 'Pro', amountCents: 1800, interval: 'month', priceEnv: 'STRIPE_PRICE_PRO', playProduct: 'baitbuddy_pro_monthly' },
  elite: { name: 'Ultimate', amountCents: 3600, interval: 'month', priceEnv: 'STRIPE_PRICE_ULTIMATE', playProduct: 'baitbuddy_ultimate_monthly' },
  friends: { name: 'Freundschaft', amountCents: 15000, interval: 'year', priceEnv: 'STRIPE_PRICE_FRIENDS', playProduct: 'baitbuddy_friends_yearly' },
  friends_monthly: { name: 'Freundschaft monatlich', amountCents: 3600, interval: 'month', priceEnv: 'STRIPE_PRICE_FRIENDS_MONTHLY', playProduct: 'baitbuddy_friends_monthly', legacy: true },
  premium_24h: { name: '24 Stunden Premium', amountCents: 499, durationHours: 24, grantsPlan: 'elite' },
  trial_10_10: { name: '10-Tage-Zugang', durationHours: 240, playProduct: 'baitbuddy_trial_10_10', legacy: true },
});
export const PLAY_PRODUCT_PLANS = Object.freeze(Object.fromEntries(
  Object.entries(BILLING_PLANS).filter(([, plan]) => plan.playProduct).map(([id, plan]) => [plan.playProduct, id])
));
export function checkoutAmount(planId, discount = 0) {
  const plan = BILLING_PLANS[canonicalPlanId(planId)];
  if (!plan?.amountCents) return null;
  const available = Number.isFinite(Number(discount)) ? Math.max(0, Math.min(3000, Math.floor(Number(discount)))) : 0;
  return canonicalPlanId(planId) === 'elite' ? Math.max(999, plan.amountCents - available) : plan.amountCents;
}
