// Ordnet Fehler aus invokeLLM/invokeLLMStream (OpenAI, Gemini, Anthropic) einer
// HTTP-Antwort zu.
//
// Früher landete jeder LLM-Fehler als generisches 500 "Verbindungsprobleme" im
// Client — auch ein aufgebrauchtes Guthaben (Anthropic: 400 "credit balance is
// too low", OpenAI: 429 "insufficient_quota"). Der Client hielt das für ein
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

  if (/credit balance|billing|insufficient_quota|exceeded your current quota/i.test(msg)) {
    code = 'llm_billing';
    status = 503;
    retryable = false;
  } else if (/_API_KEY|-Auth-Fehler|authentication_error|permission_error|invalid_api_key|Incorrect API key|API key not valid/i.test(msg)) {
    code = 'llm_not_configured';
    status = 503;
    retryable = false;
  } else if (/\b429\b|rate limit/i.test(msg)) {
    code = 'llm_rate_limited';
    status = 429;
    retryable = false;
  } else if (/timeout|timed out|Zeitüberschreitung/i.test(msg) || ['TimeoutError', 'FetchTimeoutError'].includes(/** @type {any} */ (e)?.name)) {
    code = 'llm_timeout';
    status = 504;
  }

  return { status, code, message: MESSAGES[code], retryable };
}

/** Einheitlicher Log-Eintrag: Konfigurations-/Guthabenfehler brauchen einen Admin. */
export function logLLMError(label, e, classified) {
  const msg = e && typeof (/** @type {any} */ (e).message) === 'string' ? /** @type {any} */ (e).message : String(e);
  if (classified.code === 'llm_billing') {
    console.error(`${label} KI-Guthaben/Kontingent aufgebraucht – beim Anbieter (OpenAI, Google AI Studio bzw. Anthropic Console) unter Billing aufladen.`, msg);
  } else if (classified.code === 'llm_not_configured') {
    console.error(`${label} KI-Schlüssel fehlt oder ist ungültig (OPENAI_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY prüfen).`, msg);
  } else {
    console.error(label, msg, /** @type {any} */ (e)?.stack);
  }
}
