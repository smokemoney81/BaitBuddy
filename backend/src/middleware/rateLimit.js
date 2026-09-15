import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import Redis from 'ioredis';
import { resolvePlan } from '../lib/planResolver.js';

// Der Edge-Proxy (Cloudflare bzw. frueher Vercel) terminiert die Verbindung:
// ohne 'trust proxy' ist req.ip immer die interne Proxy-Adresse — damit zaehlten
// ALLE Nutzer in denselben Limit-Topf (30 KI-Requests/Minute global statt pro
// Nutzer) und express-rate-limit loggte pro Request zwei ValidationErrors
// (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR / ERR_ERL_FORWARDED_HEADER). Die echte
// Client-IP kommt aus dem vertrauenswuerdigen Header des jeweiligen Edge:
// Cloudflare setzt 'cf-connecting-ip' (bevorzugt), Vercel 'x-vercel-forwarded-for'
// (Fallback fuer den Uebergang / Vorschau-Deploys), danach die Standard-Header.
function clientIp(req) {
  const fwd = req.headers['cf-connecting-ip']
    || req.headers['x-vercel-forwarded-for']
    || req.headers['x-real-ip']
    || req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    const first = fwd.split(',')[0].trim();
    if (first) return first;
  }
  return req.ip || 'unknown';
}

// IPv6-Normalisierung: reduziert auf /56-Subnetz
// 56 Bits = 3 komplette Hextets (48 Bits) + 8 Bits des 4. Hextets
function normalizeIp(ip) {
  if (!ip.includes(':')) return ip;
  const parts = ip.split(':');
  if (parts.length < 4) return ip;
  // /56: erste 3 Hextets + 4. Hextet (ganz)
  const subnet = parts.slice(0, 4).join(':') + '::/56';
  return subnet;
}

export const rateLimitKeyGenerator = (req) => normalizeIp(clientIp(req));

// Instanzuebergreifendes Rate-Limiting auf Vercel Serverless.
// Der Standard-MemoryStore von express-rate-limit zaehlt PRO Lambda-Instanz —
// bei mehreren gleichzeitigen Instanzen und kalten Starts ist das kein globales
// Limit. Mit gesetztem KV_URL (Vercel KV / Upstash Redis, ioredis-kompatibel)
// laeuft der Zaehler stattdessen ueber einen gemeinsamen Redis-Store, sodass das
// Limit global greift. Ohne KV_URL faellt es auf den MemoryStore zurueck (lokal,
// Dev, Tests laufen unveraendert). Faellt der KV-Store aus, blockiert das die
// App nicht (Fail-Open) — der Fehler wird geloggt, Requests laufen weiter.

const redisUrl = process.env.KV_URL || process.env.REDIS_URL;

// Modul-Scope-Singleton: auf Vercel wird der Client ueber warme Invocations
// hinweg wiederverwendet, statt pro Request neu zu verbinden.
let redisClient = null;
if (redisUrl) {
  redisClient = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableAutoPipelining: true,
  });
  redisClient.on('error', (err) => {
    console.error('[rateLimit] Redis-Store-Fehler (Fail-Open):', err.message);
  });
}

// Erzeugt fuer jeden Limiter einen eigenen RedisStore (express-rate-limit
// verlangt eine frische Store-Instanz pro Limiter). Ohne konfigurierten Redis
// gibt die Factory undefined zurueck ⇒ express-rate-limit nutzt den MemoryStore.
export function createRateLimitStore() {
  if (!redisClient) return undefined;
  return new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: 'bb:rl:',
  });
}

// KI-Chat/Analyse-Endpunkte (Claude LLM — echte Kosten pro Aufruf).
// Getrennt von TTS, damit Sprachausgabe das Chat-Budget nicht aufbraucht.
export const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: rateLimitKeyGenerator,
  store: createRateLimitStore(),
  message: { error: 'Zu viele KI-Anfragen — bitte kurz warten' },
});

// Plan-spezifisches Chat-Limit für Free-User (5 pro Tag).
// Basic+ haben unbegrenzten Zugang.
export async function checkChatRateLimit(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Auth erforderlich' });
  }

  const { effectiveId } = resolvePlan(req.user);

  // Nur Free-User limitieren
  if (effectiveId !== 'free') {
    return next();
  }

  const today = new Date().toISOString().split('T')[0];
  const key = `bb:chat:free:${req.user.id}:${today}`;
  const limit = 5;

  try {
    const client = redisClient;
    if (client) {
      const count = await client.incr(key);
      if (count === 1) {
        await client.expire(key, 24 * 60 * 60); // 24 Stunden
      }

      if (count > limit) {
        return res.status(429).json({
          error: `${limit}/${limit} tägliche KI-Anfragen verbraucht. Upgrade zu Basic für unbegrenzten Zugang.`
        });
      }
    }
  } catch (e) {
    console.error('[checkChatRateLimit] Redis-Fehler (Fail-Open):', e.message);
    // Fail-Open: Fehler beim Redis blockiert nicht
  }

  next();
}

// TTS-Endpunkt (ElevenLabs) — eigener Limiter, da jede Chat-Nachricht mit Voice
// automatisch einen TTS-Call ausloest und sonst das gemeinsame Budget doppelt
// belastet wird.
export const ttsRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: rateLimitKeyGenerator,
  store: createRateLimitStore(),
  message: { error: 'Zu viele Sprachanfragen — bitte kurz warten' },
});

// Auth-Endpunkte (Login/Register/Refresh) gegen Brute-Force/Credential-Stuffing.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: rateLimitKeyGenerator,
  store: createRateLimitStore(),
  message: { error: 'Zu viele Anmeldeversuche — bitte später erneut versuchen' },
});
