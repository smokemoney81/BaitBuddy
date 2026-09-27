// Bildet jeden bestehenden Plan-Code (inkl. Aliase aus planResolver.PLAN_RANK)
// auf einen der drei Credit-Tarife free/basic/premium ab. Rein, ohne DB.
// Wird in einem Folgeschritt in planResolver.js eingebunden.

export const CREDIT_PLAN_CODES = Object.freeze(['free', 'basic', 'pro', 'ultimate', 'friends', 'pass']);

export function mapPlanCodeToCreditPlan(planCode) {
  if (typeof planCode !== 'string') return 'free';
  const code = planCode.trim().toLowerCase();
  if (code === 'basic') return 'basic';
  if (code === 'pro' || code === 'premium') return 'pro';
  if (code === 'friends' || code === 'friends_monthly') return 'friends';
  if (code === 'elite' || code === 'ultimate' || code === 'trial_10_10') return 'ultimate';
  return 'free';
}
