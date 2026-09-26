// Fehlercode des Servers, wenn das monatliche KI-Volumen (Buddy-Tokens) eines
// Plans aufgebraucht ist (backend/src/lib/aiTokenQuota.js, HTTP 429).
export const AI_QUOTA_EXCEEDED_CODE = 'ai_token_quota_exceeded';

// Unterscheidet das Monatsvolumen von kurzzeitigen Limits (429 ohne Code):
// dort hilft Warten, hier erst die Erneuerung oder ein höherer Plan.
export function isQuotaExceeded(error) {
  return error?.status === 429 && error?.data?.code === AI_QUOTA_EXCEEDED_CODE;
}
