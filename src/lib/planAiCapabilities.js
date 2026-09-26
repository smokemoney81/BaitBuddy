// Was die KI je Tarif tatsächlich unterscheidet. Gespiegelt aus
// backend/src/lib/personalizationEngine.js (contextBudget, sentenceRange) und
// backend/src/middleware/rateLimit.js (Chat-Limit ohne Plan); das KI-Volumen
// kommt zur Laufzeit vom Server (GET /api/ai/usage);
// planAiCapabilities.test.js prüft, dass beide Seiten übereinstimmen.
export const PLAN_TIERS = [
  { planId: 'free', tier: 'guest', label: 'Gast' },
  { planId: 'basic', tier: 'basic', label: 'Basic' },
  { planId: 'pro', tier: 'pro', label: 'Pro' },
  { planId: 'elite', tier: 'ultimate', label: 'Ultimate' },
];

export const TIER_BUDGET = {
  guest: { catches: 0, spots: 0, plans: 0, gear: 0, profile: false, history: false, proactive: false },
  basic: { catches: 5, spots: 5, plans: 3, gear: 10, profile: true, history: false, proactive: false },
  pro: { catches: 15, spots: 10, plans: 5, gear: 25, profile: true, history: true, proactive: false },
  ultimate: { catches: 25, spots: 15, plans: 10, gear: 40, profile: true, history: true, proactive: true },
};

// Satzspanne bei Antwortlänge "normal".
export const TIER_SENTENCES = {
  guest: { min: 1, max: 2 },
  basic: { min: 2, max: 4 },
  pro: { min: 4, max: 8 },
  ultimate: { min: 4, max: 14 },
};

export const FREE_CHAT_MESSAGES_PER_DAY = 5;

// Stufe 0–3 steuert die Farbpunkte der Vergleichstabelle.
const LEVEL = { guest: 0, basic: 1, pro: 2, ultimate: 3 };

// Server-Plan-ID je Stufe für das KI-Volumen (GET /api/ai/usage → plan_quotas).
const QUOTA_KEY = { guest: 'free', basic: 'basic', pro: 'pro', ultimate: 'elite' };

export function formatTokens(value) {
  return Number(value || 0).toLocaleString('de-DE');
}

export function capabilityRows({ voiceRequiredPlanRank, tokenQuotas = null }) {
  const planRank = { guest: 0, basic: 1, pro: 2, ultimate: 3 };
  // Das Monatsvolumen kommt vom Server (Quelle: aiTokenQuota.js); ohne Antwort
  // bleibt die Zeile weg statt geschätzte Zahlen zu zeigen.
  const volumeRow = tokenQuotas ? [{
    id: 'volume',
    label: 'KI-Volumen',
    hint: 'Buddy-Tokens pro Monat für Chat, Voice-Chat, Vorlesen, Foto-Analyse und KI-Werkzeuge.',
    cells: PLAN_TIERS.map(({ tier }) => ({
      level: LEVEL[tier],
      text: `${formatTokens(tokenQuotas[QUOTA_KEY[tier]])} / Monat`,
    })),
  }] : [];
  return [
    ...volumeRow,
    {
      id: 'context',
      label: 'Kontext\u00ADtiefe',
      hint: 'Wie viele deiner Fänge, Spots und Trips der Buddy pro Antwort einbezieht.',
      cells: PLAN_TIERS.map(({ tier }) => {
        const b = TIER_BUDGET[tier];
        return {
          level: LEVEL[tier],
          text: b.catches === 0 ? 'Keine eigenen Daten' : `${b.catches} Fänge · ${b.spots} Spots · ${b.plans} Trips`,
        };
      }),
    },
    {
      id: 'personalization',
      label: 'Personali\u00ADsierung',
      hint: 'Ob dein Angler-Profil, dein Verlauf und proaktive Hinweise genutzt werden.',
      cells: PLAN_TIERS.map(({ tier }) => {
        const b = TIER_BUDGET[tier];
        const text = !b.profile ? 'Keine (Standard)'
          : b.proactive ? 'Profil, Verlauf & proaktive Tipps'
          : b.history ? 'Profil & Verlauf'
          : 'Profil';
        return { level: LEVEL[tier], text };
      }),
    },
    {
      id: 'length',
      label: 'Antwort\u00ADumfang',
      hint: 'Satzspanne pro Antwort bei Antwortlänge „Normal“.',
      cells: PLAN_TIERS.map(({ tier }) => {
        const s = TIER_SENTENCES[tier];
        return { level: LEVEL[tier], text: `${s.min}–${s.max} Sätze` };
      }),
    },
    {
      id: 'chat',
      label: 'Chat-Limit',
      hint: 'Nachrichten an den KI-Buddy pro Tag (zusätzlich zum KI-Volumen).',
      cells: PLAN_TIERS.map(({ tier }) => ({
        level: tier === 'guest' ? 0 : 3,
        text: tier === 'guest' ? `${FREE_CHAT_MESSAGES_PER_DAY} Nachrichten/Tag` : 'Kein Tageslimit',
      })),
    },
    {
      id: 'voice',
      label: 'Voice-Buddy',
      hint: 'Sprachgespräch mit dem Buddy.',
      cells: PLAN_TIERS.map(({ tier }) => {
        const available = planRank[tier] >= voiceRequiredPlanRank;
        return { level: available ? LEVEL[tier] : 0, text: available ? 'Verfügbar' : 'Nicht verfügbar' };
      }),
    },
  ];
}
