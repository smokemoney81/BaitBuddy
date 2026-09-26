import { supabase } from './supabase.js';
import { resolvePlan, planRank } from './planResolver.js';
import { resolveToolAccess } from './entitlementResolver.js';
import { isAllToolsFree } from './appSettings.js';

const TOOL_ID_PATTERN = /^[a-z0-9_-]+$/;

/**
 * Server-side source of truth for permanent tool ownership. Clients never
 * supply an entitlement flag; only an active Premium plan or a non-revoked
 * server-owned ledger entry can make a request eligible.
 *
 * The monthly AI volume (Buddy-Tokens) is enforced separately by
 * meterAiTokens in aiTokenQuota.js.
 *
 * `requiredPlanRank` (planResolver.PLAN_RANK) limits the plan path to a minimum
 * tier, e.g. the female voice is Ultimate-only (rank 3). Basic/Pro then count as
 * "no Premium" for this tool; only a server-owned ledger grant can open it.
 */
export async function resolveServerToolAccess({ user, toolId, requiredPlanRank = 1, monthlyLimit = null, monthlyUsed = 0 }) {
  if (!user?.id) throw new Error('Authenticated user is required');
  if (typeof toolId !== 'string' || !TOOL_ID_PATTERN.test(toolId)) {
    throw new Error('Invalid tool identifier');
  }

  // Permanenten Unlock aus dem Ledger lesen. Ein LESEFEHLER darf einen aktiven
  // Premium-/Ultimate-Nutzer NICHT hart sperren: frueher wurde der Fehler
  // geworfen (500), sodass z. B. die Ultimate-Female-Voice bei einem
  // Ledger-Fehler komplett ausfiel, obwohl der aktive Plan allein Zugriff gibt.
  // Deshalb degradieren wir bei Lesefehlern zu "kein permanenter Unlock" und
  // lassen die Entscheidung ueber premiumActive laufen (fail-safe, nie
  // faelschlich freischaltend — ein fehlender Unlock kann nur Zugriff entziehen,
  // nicht gewaehren).
  let permanentUnlock = null;
  const { data, error } = await supabase
    .from('user_tool_unlocks')
    .select('unlock_type')
    .eq('user_id', user.id)
    .eq('tool_id', toolId)
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`[toolEntitlements] Ledger-Lesefehler fuer ${toolId} (fail-safe, kein Unlock):`, error.message || error);
  } else {
    permanentUnlock = data;
  }

  const { isActive, effectiveId } = resolvePlan(user);
  // Modus „alle Tools kostenlos“ (Admin-Bereich) zählt wie ein passender Plan.
  const premiumActive = (isActive && planRank(effectiveId) >= requiredPlanRank) || await isAllToolsFree();
  return resolveToolAccess({
    premiumActive,
    permanentUnlock: Boolean(permanentUnlock),
    unlockType: permanentUnlock?.unlock_type || null,
    monthlyLimit,
    monthlyUsed,
  });
}
