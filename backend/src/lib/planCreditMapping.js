// Bildet jeden bestehenden Plan-Code (inkl. Aliase aus planResolver.PLAN_RANK)
// auf einen der drei Credit-Tarife free/basic/premium ab. Rein, ohne DB.
// Wird in einem Folgeschritt in planResolver.js eingebunden.

export const CREDIT_PLAN_CODES = Object.freeze(['free', 'basic', 'premium']);

const PREMIUM_ALIASES = new Set([
  'premium', 'pro', 'elite', 'ultimate', 'friends_monthly', 'trial_10_10', 'friends',
]);

export function mapPlanCodeToCreditPlan(planCode) {
  if (typeof planCode !== 'string') return 'free';
  const code = planCode.trim().toLowerCase();
  if (code === 'basic') return 'basic';
  if (PREMIUM_ALIASES.has(code)) return 'premium';
  return 'free';
}
