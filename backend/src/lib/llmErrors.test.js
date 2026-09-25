import { describe, it, expect } from 'vitest';
import { classifyLLMError } from './llmErrors.js';

const BILLING = 'Claude API Fehler 400: {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011CfPLGADiUB17DNvySTkTZ"}';

describe('classifyLLMError', () => {
  it('erkennt ein aufgebrauchtes Anthropic-Guthaben als dauerhaften 503', () => {
    const c = classifyLLMError(new Error(BILLING));
    expect(c).toMatchObject({ status: 503, code: 'llm_billing', retryable: false });
    expect(c.message).toMatch(/Guthaben/);
    expect(c.message).not.toMatch(/Verbindung/);
  });

  it('erkennt fehlende oder ungültige Schlüssel', () => {
    expect(classifyLLMError(new Error('KI-Service nicht verfügbar – ANTHROPIC_API_KEY fehlt'))).toMatchObject({ code: 'llm_not_configured', status: 503, retryable: false });
    expect(classifyLLMError(new Error('Claude-Auth-Fehler 401: Ungültiger oder fehlender API-Key.'))).toMatchObject({ code: 'llm_not_configured', retryable: false });
  });

  it('erkennt ein aufgebrauchtes OpenAI-Kontingent und ungültige OpenAI-/Gemini-Schlüssel', () => {
    expect(classifyLLMError(new Error('OpenAI API Fehler 429: {"error":{"message":"You exceeded your current quota, please check your plan and billing details.","code":"insufficient_quota"}}'))).toMatchObject({ code: 'llm_billing', retryable: false });
    expect(classifyLLMError(new Error('OpenAI-Auth-Fehler 401: Ungültiger oder fehlender API-Key. Bitte OPENAI_API_KEY überprüfen.'))).toMatchObject({ code: 'llm_not_configured' });
    expect(classifyLLMError(new Error('Gemini API Fehler 400: {"error":{"message":"API key not valid. Please pass a valid API key."}}'))).toMatchObject({ code: 'llm_not_configured' });
    expect(classifyLLMError(new Error('KI-Service nicht verfügbar – kein KI-Schlüssel gesetzt (OPENAI_API_KEY …)'))).toMatchObject({ code: 'llm_not_configured' });
  });

  it('meldet Rate-Limits als 429 und Timeouts als 504', () => {
    expect(classifyLLMError(new Error('Claude Rate-Limit (429): Zu viele Anfragen.'))).toMatchObject({ status: 429, code: 'llm_rate_limited' });
    expect(classifyLLMError(new Error('Request timeout after 25000ms'))).toMatchObject({ status: 504, code: 'llm_timeout', retryable: true });
    expect(classifyLLMError(Object.assign(new Error('Zeitüberschreitung nach 30000ms beim Aufruf von https://api.openai.com/v1/chat/completions'), { name: 'FetchTimeoutError' }))).toMatchObject({ code: 'llm_timeout' });
  });

  it('behandelt Unbekanntes als wiederholbaren 500, auch bei Nicht-Error-Throws', () => {
    expect(classifyLLMError(new Error('Claude API Fehler 503'))).toMatchObject({ status: 500, code: 'llm_error', retryable: true });
    expect(classifyLLMError('boom')).toMatchObject({ status: 500, code: 'llm_error' });
    expect(classifyLLMError(undefined)).toMatchObject({ status: 500, code: 'llm_error' });
  });

  it('wertet Ziffern in einer Request-ID nicht als Rate-Limit', () => {
    expect(classifyLLMError(new Error('Claude API Fehler 500: {"request_id":"req_011C429x"}')).code).toBe('llm_error');
  });
});
