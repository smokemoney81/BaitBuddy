// Ordnet Fehler aus invokeLLM/invokeLLMStream einer HTTP-Antwort zu.
//
// Früher landete jeder LLM-Fehler als generisches 500 "Verbindungsprobleme" im
// Client — auch ein aufgebrauchtes Anthropic-Guthaben (Anthropic antwortet dann
// mit 400 "credit balance is too low"). Der Client hielt das für ein
// Netzproblem, wiederholte die Anfrage mehrfach und zeigte dem Nutzer den
// Offline-Text "Ohne Verbindung ...", obwohl das Netz funktionierte.
//
// `retryable` sagt dem Client, ob ein erneuter Versuch sinnvoll ist: Guthaben,
// fehlender/ungültiger Schlüssel und Rate-Limits ändern sich nicht innerhalb
// von Sekunden — dort wäre jeder Retry ein weiterer sinnloser Upstream-Aufruf.

const MESSAGES = {
  llm_billing:
    'Meine Online-KI ist gerade gesperrt, weil das KI-Guthaben der App aufgebraucht ist. Allgemeine Angelfragen beantworte ich weiter aus meinem eingebauten Wissen.',
  llm_not_configured:
    'Meine KI-Services sind gerade nicht konfiguriert (fehlender oder ungültiger API-Schlüssel). Der Admin muss das fixen.',
  llm_rate_limited: 'Ich bin gerade überlastet. Versuch es in ein paar Sekunden nochmal!',
  llm_timeout: 'Die Anfrage hat zu lange gedauert. Versuch es nochmal!',
  llm_error: 'Entschuldige, ich habe gerade Verbindungsprobleme. Versuch es gleich nochmal!',
};

/**
 * @param {unknown} e Fehler aus dem LLM-Aufruf
 * @returns {{ status: number, code: keyof typeof MESSAGES, message: string, retryable: boolean }}
 */
export function classifyLLMError(e) {
  const msg = e && typeof (/** @type {any} */ (e).message) === 'string'
    ? /** @type {any} */ (e).message
    : String(e);

  let code = /** @type {keyof typeof MESSAGES} */ ('llm_error');
  let status = 500;
  let retryable = true;

  if (/credit balance|billing|Plans & Billing/i.test(msg)) {
    code = 'llm_billing';
    status = 503;
    retryable = false;
  } else if (msg.includes('ANTHROPIC_API_KEY') || /Claude-Auth-Fehler|authentication_error|permission_error/i.test(msg)) {
    code = 'llm_not_configured';
    status = 503;
    retryable = false;
  } else if (/\b429\b|rate limit/i.test(msg)) {
    code = 'llm_rate_limited';
    status = 429;
    retryable = false;
  } else if (/timeout|timed out|TimeoutError/i.test(msg) || /** @type {any} */ (e)?.name === 'TimeoutError') {
    code = 'llm_timeout';
    status = 504;
  }

  return { status, code, message: MESSAGES[code], retryable };
}

/** Einheitlicher Log-Eintrag: Konfigurations-/Guthabenfehler brauchen einen Admin. */
export function logLLMError(label, e, classified) {
  const msg = e && typeof (/** @type {any} */ (e).message) === 'string' ? /** @type {any} */ (e).message : String(e);
  if (classified.code === 'llm_billing') {
    console.error(`${label} Anthropic-Guthaben aufgebraucht – Credits in der Anthropic Console aufladen (Plans & Billing).`, msg);
  } else if (classified.code === 'llm_not_configured') {
    console.error(`${label} Anthropic-API-Schlüssel fehlt oder ist ungültig (ANTHROPIC_API_KEY prüfen).`, msg);
  } else {
    console.error(label, msg, /** @type {any} */ (e)?.stack);
  }
}
