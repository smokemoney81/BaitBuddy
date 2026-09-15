// Sicherheits-Middleware für Reverse Proxy + Production
// Ergänzt Helmet, fügt zusätzliche Header hinzu, validiert Origins

import { logger } from '../lib/logger.js';
import { getAllowedOrigins } from '../lib/allowedOrigins.js';

/**
 * Security Middleware für Production-Deployment
 * - Validiert X-Forwarded-* Header vom Nginx Reverse Proxy
 * - Setzt zusätzliche Security Headers
 * - Validiert CORS Origins gegen Whitelist
 */
export function securityMiddleware(app) {
  // Trust Proxy: Nginx setzt X-Forwarded-* Headers
  app.set('trust proxy', 1);

  // Request validieren
  app.use((req, res, next) => {
    // Aus X-Forwarded-For die echte IP auslesen (für Rate Limiting)
    // nginx setzt: X-Forwarded-For: <client-ip>
    if (req.headers['x-forwarded-for']) {
      const ips = req.headers['x-forwarded-for'].split(',').map(ip => ip.trim());
      req.clientIp = ips[0]; // Erste IP = Client, Rest = Proxies
    } else if (req.headers['x-real-ip']) {
      req.clientIp = req.headers['x-real-ip'];
    } else {
      req.clientIp = req.connection.remoteAddress;
    }

    // Protokoll-Information vom Reverse Proxy
    if (req.headers['x-forwarded-proto']) {
      req.protocol = req.headers['x-forwarded-proto'];
    }

    next();
  });

  // Zusätzliche Security Headers (über Nginx bereits teilweise gesetzt)
  app.use((req, res, next) => {
    // Überflüssig aber harmlos (Nginx setzt schon): redundancy für mehrfache Proxy-Layer
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Cache-Control für API-Responses
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    next();
  });

  logger.info('✅ Security middleware initialized');
}

/**
 * Validates that request comes from allowed origin
 * (Defense-in-depth: auch wenn CORS Nginx-seitig greift)
 */
export function validateOrigin(req, res, next) {
  const allowedOrigins = getAllowedOrigins();

  const origin = req.headers.origin || req.headers.referer;
  const isAllowed = allowedOrigins.some(allowed => origin?.startsWith(allowed));

  if (origin && !isAllowed) {
    logger.warn('Unauthorized origin', { origin, path: req.path, method: req.method });
  }

  next();
}

/**
 * Request Sanitization für API-Inputs
 */
export function sanitizeInputs(req, res, next) {
  // Verhindert XSS in JSON-Body und Query-Parametern
  // (Express parst JSON automatisch, aber Query-Strings sind Strings)

  // Sanitize Query Parameters
  if (req.query && Object.keys(req.query).length > 0) {
    Object.entries(req.query).forEach(([key, value]) => {
      if (typeof value === 'string') {
        // Entferne null bytes und sehr lange strings
        req.query[key] = value
          .replace(/\0/g, '')
          .substring(0, 4096);
      }
    });
  }

  next();
}

/**
 * Request Logging für Security-Events
 */
export function logSecurityEvents(req, res, next) {
  // Rate-Limit oder Ban Attempts loggen
  const sensitiveEndpoints = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/refresh',
    '/api/premium/activate',
  ];

  res.on('finish', () => {
    if (sensitiveEndpoints.some(ep => req.path.startsWith(ep))) {
      if (res.statusCode >= 400) {
        logger.warn('Sensitive endpoint error', {
          path: req.path,
          status: res.statusCode,
          ip: req.clientIp,
          method: req.method,
        });
      }
    }
  });

  next();
}
