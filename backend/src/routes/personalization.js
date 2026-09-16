import express from 'express';
import { supabase } from '../lib/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { personalizationContext } from '../lib/personalizationEngine.js';
import { deriveCatchPatterns } from '../lib/anglerInsights.js';

const router = express.Router();

/**
 * GET /api/personalization/me
 *
 * Transparenzbereich "BaitBuddy kennt dich" (§6): liefert genau das, was der
 * Buddy über dieses Konto weiß — gespeicherte Präferenzen, das Angler-Profil,
 * die aus der echten Fanghistorie abgeleiteten Muster sowie den Umfang der
 * bekannten Ausrüstung und Touren.
 *
 * Korrigiert und gelöscht wird über den bestehenden Präferenz-Pfad
 * (PATCH /auth/me, Section-Merge) — dieser Endpunkt liest nur.
 *
 * Die Stufe steuert auch hier die Tiefe: Was der Buddy laut `contextBudget`
 * nicht verwenden darf, wird gar nicht erst geladen. Sonst zeigte die Seite
 * Wissen an, das in keine Antwort einfließt.
 */
router.get('/me', requireAuth, async (req, res) => {
  const userEmail = req.user.email;
  const context = personalizationContext(req.user);
  const budget = context.budget;

  const empty = { data: [], error: null };
  const [catchesResult, gearResult, plansResult] = await Promise.all([
    budget.catches > 0
      ? supabase.from('catches')
        .select('species,bait_used,water_body,spot_name,catch_time,weight_kg')
        .eq('created_by', userEmail)
        .order('catch_time', { ascending: false })
        .limit(budget.catches)
      : Promise.resolve(empty),
    budget.gear > 0
      ? supabase.from('gear_items').select('data').eq('created_by', userEmail).limit(budget.gear)
      : Promise.resolve(empty),
    budget.plans > 0
      ? supabase.from('fishing_plans').select('title,target_fish,planned_date')
        .eq('created_by', userEmail)
        .order('planned_date', { ascending: false })
        .limit(budget.plans)
      : Promise.resolve(empty),
  ]);

  // Ein Lesefehler darf die Seite nicht leeren, aber auch nicht als "nichts
  // bekannt" durchgehen — beides wäre eine falsche Aussage über die Daten.
  const sources = {
    catches: !catchesResult.error,
    gear: !gearResult.error,
    trips: !plansResult.error,
  };

  const catches = catchesResult.data || [];
  const gear = (gearResult.data || []).map((row) => row.data?.name).filter(Boolean);
  const trips = plansResult.data || [];

  return res.json({
    tier: context.tier,
    detail: context.detail,
    personalized: budget.profile,
    profile: context.profile,
    patterns: budget.history ? deriveCatchPatterns(catches) : { enoughData: false, total: 0, patterns: [] },
    gear: { known: gear.slice(0, 40), total: gear.length },
    trips: trips.map((t) => ({ title: t.title, targetFish: t.target_fish, plannedDate: t.planned_date })),
    // Quellen, die sich nicht lesen ließen. Die UI weist darauf hin, statt einen
    // unvollständigen Stand als vollständig zu zeigen.
    incompleteSources: Object.entries(sources).filter(([, ok]) => !ok).map(([name]) => name),
  });
});

export default router;
