// Läuft vor jedem Backend-Testfile. Setzt Dummy-Env-Variablen, BEVOR
// Routen/lib-Module importiert werden — backend/src/lib/supabase.js wirft sonst
// beim Modul-Import, weil SUPABASE_SERVICE_ROLE_KEY fehlt. VERCEL=1 verhindert,
// dass server.js beim Import einen echten Port bindet (app.listen).
process.env.NODE_ENV = 'test';
process.env.VERCEL = '1';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-role-key';
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-anthropic-key';
process.env.ADMIN_EMAILS = process.env.ADMIN_EMAILS || 'admin@baitbuddy.test';
process.env.CRON_SECRET = process.env.CRON_SECRET || 'test-cron-secret';
// KI-Anbieter deterministisch halten: Ohne OpenAI-/Gemini-Schlüssel antwortet
// in den LLM-Tests die Reserve Anthropic; Tests für OpenAI/Gemini setzen ihre
// Schlüssel selbst. Ein Schlüssel aus der Shell des Entwicklers darf hier
// keinen echten Upstream-Aufruf auslösen.
for (const name of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY']) {
  delete process.env[name];
}
