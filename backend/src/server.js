import 'dotenv/config';
import express from 'express';
// Leitet in async-Route-Handlern geworfene Rejections an die Error-Middleware
// weiter. Express 4 tut das nicht von selbst — ohne dies würde ein geworfener
// Fehler (z.B. Netzwerk-/Timeout aus Supabase oder fetch) zu einer unbehandelten
// Rejection und der Request bliebe bis zum Plattform-Timeout hängen.
import { registerAsyncErrorHandling } from './middleware/asyncHandler.js';
import cors from 'cors';
import helmet from 'helmet';
import { logger, requestLogger, errorLogger, initSentry } from './lib/logger.js';
import { securityMiddleware, validateOrigin, sanitizeInputs, logSecurityEvents } from './middleware/security.js';
import authRoutes from './routes/auth.js';
import aiRoutes from './routes/ai.js';
import catchesRoutes from './routes/catches.js';
import spotsRoutes from './routes/spots.js';
import communityRoutes from './routes/community.js';
import eventsRoutes from './routes/events.js';
import premiumRoutes, { stripeWebhookHandler } from './routes/premium.js';
import gearRoutes from './routes/gear.js';
import miscRoutes from './routes/misc.js';
import mapsRoutes from './routes/maps.js';
import supportRoutes from './routes/support.js';
import userEntitiesRoutes from './routes/userEntities.js';
import socialMediaRoutes from './routes/socialMedia.js';
import syncRoutes from './routes/sync.js';
import waterDataRoutes from './routes/waterData.js';
import bathymetryRoutes from './routes/bathymetry.js';
import backupRoutes from './routes/backups.js';
import notesRoutes from './routes/notes.js';
import functionsRoutes from './routes/functions.js';
import referralsRoutes from './routes/referrals.js';
import adminRoutes from './routes/admin.js';
import adsRoutes from './routes/ads.js';
import dashboardRoutes from './routes/dashboard.js';
import personalizationRoutes from './routes/personalization.js';
import videoRoutes from './routes/video.js';
import { aiRateLimiter, ttsRateLimiter, authRateLimiter } from './middleware/rateLimit.js';
import { getAnthropicKey } from './lib/llm.js';
import { getAllowedOrigins } from './lib/allowedOrigins.js';

const app = express();
initSentry();
const PORT = process.env.PORT || 3000;

// ESM-kompatible Async-Error-Handling
registerAsyncErrorHandling(app);

// Security-Middleware
securityMiddleware(app);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: getAllowedOrigins(),
  credentials: true
}));
// Stripe's signature is calculated over the original byte stream. This route
// must therefore remain before the global JSON parser and all auth middleware.
app.post('/api/premium/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler);
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// Input-Sanitization + Origin-Validierung + Security-Logging
app.use(validateOrigin);
app.use(sanitizeInputs);
app.use(logSecurityEvents);

// Findet den OpenAI-Key tolerant (OPENAI_API_KEY, Openai_key, …) — nur zur
// Diagnose, ob Voice serverseitig konfiguriert ist. Gibt KEINEN Wert preis.
function hasOpenAIKey() {
  return !!(process.env.OPENAI_API_KEY
    || Object.entries(process.env).find(([k, v]) => /open.?_?ai/i.test(k) && /key|token|secret/i.test(k) && v)?.[1]);
}
// `ai` zeigt an, ob der Claude-Key serverseitig ankommt — erlaubt eine
// Diagnose des KI-Chats ohne Auth (kein LLM-Call, kein Key-Wert im Response).
const healthPayload = () => ({ ok: true, app: 'BaitBuddy', version: '1.0.0', voice: hasOpenAIKey(), ai: !!getAnthropicKey() });
app.get('/health', (req, res) => res.json(healthPayload()));
app.get('/api/health', (req, res) => res.json(healthPayload()));

// Rate-Limiting per Pfad-Präfix (in Tests via NODE_ENV=test übersprungen, damit
// wiederholte Requests im selben Testlauf nicht in die Limits laufen). Scoped
// auf teure/sensible Pfade: Das /api/ai-Präfix deckt ALLE KI-Routen ab, inkl.
// /api/ai/test (auth-pflichtig + limitiert). Nur /health und /api/health sind
// unlimitiert (kein LLM-Call). /api/analyze-photo zählt zu den KI-Kosten,
// liegt aber nicht unter /api/ai, daher separat verdrahtet.
if (process.env.NODE_ENV !== 'test') {
  app.use('/api/ai/tts', ttsRateLimiter);
  app.use('/api/ai', aiRateLimiter);
  app.use('/api/analyze-photo', aiRateLimiter);
  app.use('/api/auth/login', authRateLimiter);
  app.use('/api/auth/register', authRateLimiter);
  app.use('/api/auth/refresh', authRateLimiter);
}

app.use('/api', authRoutes);
app.use('/api', aiRoutes);
app.use('/api', catchesRoutes);
app.use('/api', spotsRoutes);
app.use('/api', communityRoutes);
app.use('/api', eventsRoutes);
app.use('/api', premiumRoutes);
app.use('/api', gearRoutes);
app.use('/api', miscRoutes);
app.use('/api', mapsRoutes);
app.use('/api', supportRoutes);
app.use('/api', userEntitiesRoutes);
app.use('/api', socialMediaRoutes);
app.use('/api', syncRoutes);
app.use('/api', waterDataRoutes);
app.use('/api', bathymetryRoutes);
app.use('/api', backupRoutes);
app.use('/api', notesRoutes);
app.use('/api', functionsRoutes);
app.use('/api', referralsRoutes);
app.use('/api', adminRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/personalization', personalizationRoutes);
app.use('/api/video', videoRoutes);

app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));
app.use(errorLogger);

// NODE_ENV=test (siehe backend/test/setup.js) haelt den Server auch dann vom
// echten Port-Binding ab, wenn ein Test absichtlich process.env.VERCEL
// entfernt, um den Nicht-Vercel-Codepfad einzelner Routen zu pruefen.
if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });

  // Graceful Shutdown für Docker SIGTERM
  // Docker sendet SIGTERM und erwartet Shutdown innerhalb von 10 Sekunden.
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, starting graceful shutdown...');

    // 1. Keine neuen Requests mehr akzeptieren
    server.close(() => {
      logger.info('Server closed, no new requests accepted');
    });

    // 2. Bestehende Requests zu Ende laufen lassen (Timeout: 9 Sekunden)
    const shutdownTimeout = setTimeout(() => {
      logger.warn('Shutdown timeout reached, forcefully exiting');
      process.exit(1);
    }, 9000);

    try {
      // 3. Supabase-Client sauber abfahren (falls vorhanden)
      // Supabase hat normalerweise keine explizite close() Methode,
      // aber Axios/HTTP-Connections werden durch Server.close() beendet

      // 4. Erfolgreicher Shutdown
      clearTimeout(shutdownTimeout);
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', { error: error.message });
      process.exit(1);
    }
  });

  // Alternative zu SIGTERM (SIGINT von Ctrl+C)
  process.on('SIGINT', () => {
    logger.info('SIGINT received, starting graceful shutdown...');
    server.close(() => process.exit(0));
  });

  // Uncaught Exception Handler (sollte nicht passieren, aber sicher ist sicher)
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
    process.exit(1);
  });

  // Unhandled Rejection Handler
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason: String(reason), promise: String(promise) });
    process.exit(1);
  });
}

export default app;
