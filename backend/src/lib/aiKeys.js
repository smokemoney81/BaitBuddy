// Tolerantes Lesen der KI-Schlüssel aus der Umgebung.
//
// In Vercel wurden Schlüssel in der Vergangenheit unter abweichenden Namen
// angelegt (CLAUDE_API_KEY, Openai_key, …), wodurch KI-Funktionen trotz
// gesetztem Schlüssel ausfielen. Namens-Varianten zählen nur, wenn der Wert
// wie ein echter Schlüssel des Anbieters aussieht — das verhindert Fehltreffer
// durch Plattform-Variablen (z. B. Tokens von Hosting-Tools).

// Entfernt Whitespace und versehentlich mitkopierte Anführungszeichen —
// häufiger Fehler beim Einfügen von Keys in Vercel-Umgebungsvariablen.
export function cleanKey(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/^["']|["']$/g, '').trim();
  return trimmed || null;
}

function findVariant(namePattern, valuePattern) {
  for (const [name, value] of Object.entries(process.env)) {
    if (!namePattern.test(name)) continue;
    if (!/key|token|secret/i.test(name)) continue;
    const cleaned = cleanKey(value);
    if (cleaned && valuePattern.test(cleaned)) return cleaned;
  }
  return null;
}

/** Anthropic: ANTHROPIC_API_KEY, sonst Varianten wie CLAUDE_API_KEY (Wert sk-ant-…). */
export function getAnthropicKey() {
  return cleanKey(process.env.ANTHROPIC_API_KEY)
    || findVariant(/(^|_)(anthropic|claude|cloude)/i, /^sk-ant-/);
}

/** OpenAI (ChatGPT): OPENAI_API_KEY, sonst Varianten wie Openai_key (Wert sk-…, nicht sk-ant-). */
export function getOpenAIKey() {
  return cleanKey(process.env.OPENAI_API_KEY)
    || findVariant(/open.?_?ai/i, /^sk-(?!ant-)/);
}

/** Google Gemini: GEMINI_API_KEY bzw. GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY. */
export function getGeminiKey() {
  return cleanKey(process.env.GEMINI_API_KEY)
    || cleanKey(process.env.GOOGLE_API_KEY)
    || cleanKey(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}
