// Welche Worker-Variablen/-Secrets an den Backend-Container durchgereicht
// werden. Liegt getrennt von worker.js (ohne Cloudflare-Importe), damit es in
// Node testbar ist. Neue Backend-Variablen hier ergänzen — was nicht in der
// Liste steht, sieht die Express-App im Container nicht.
export const FORWARDED_ENV = [
  // Pflicht
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'CRON_SECRET',
  // App & Zugriff
  'ALLOWED_ORIGINS', 'APP_URL', 'APP_BASE_URL', 'SUPABASE_PUBLIC_URL', 'ADMIN_EMAILS', 'ADMIN_API_KEY',
  'SUPERUSER_EMAIL', 'LOG_LEVEL', 'EVENT_ARCHIVE_DAYS', 'CLERK_SECRET_KEY', 'CLERK_JWT_KEY',
  // KI & Stimme
  'ANTHROPIC_MODEL', 'OPENAI_API_KEY', 'OPENAI_REALTIME_MODEL', 'OPENAI_REALTIME_VOICE',
  'ELEVENLABS_API_KEY', 'ELEVENLABS_MODEL_ID', 'ELEVENLABS_OUTPUT_FORMAT', 'ELEVENLABS_VOICE_ID',
  'ELEVENLABS_VOICE_ID_FEMALE', 'GOOGLE_CLOUD_API_KEY', 'GEMINI_API_KEY', 'GEMINI_TTS_MODEL',
  // Zahlungen
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
  // E-Mail
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SUPPORT_EMAIL', 'DEVELOPER_EMAIL',
  // Betrieb
  'KV_URL', 'REDIS_URL', 'SENTRY_DSN', 'SENTRY_TRACES_SAMPLE_RATE',
];

export const CONTAINER_PORT = 3000; // PORT in docker/backend.Dockerfile

export function containerEnv(source = {}) {
  const out = { NODE_ENV: 'production', PORT: String(CONTAINER_PORT) };
  for (const key of FORWARDED_ENV) {
    const value = source[key];
    if (typeof value === 'string' && value !== '') out[key] = value;
  }
  return out;
}
