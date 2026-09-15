import * as Sentry from "@sentry/node";

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4,
};

const MIN_LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || (
  process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG'
)];

// WeakMap, nicht Map: der Kontext haengt am req-Objekt und verschwindet mit ihm.
// Mit einer starken Map wuerde jeder Request, der nicht ueber res.json()
// antwortet (Fehler, res.send, res.end), dauerhaft im Speicher bleiben.
const requestContextMap = new WeakMap();

export function setRequestContext(req, context) {
  requestContextMap.set(req, context);
}

export function getRequestContext(req) {
  return requestContextMap.get(req) || {};
}

export function clearRequestContext(req) {
  requestContextMap.delete(req);
}

export const logger = {
  debug(message, data = {}) {
    if (LOG_LEVELS.DEBUG >= MIN_LOG_LEVEL) {
      console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'DEBUG', message, ...data }));
    }
  },

  info(message, data = {}) {
    if (LOG_LEVELS.INFO >= MIN_LOG_LEVEL) {
      console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'INFO', message, ...data }));
    }
  },

  warn(message, data = {}) {
    if (LOG_LEVELS.WARN >= MIN_LOG_LEVEL) {
      console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'WARN', message, ...data }));
      if (process.env.NODE_ENV === 'production') {
        Sentry.captureMessage(message, 'warning');
      }
    }
  },

  error(message, error, data = {}) {
    if (LOG_LEVELS.ERROR >= MIN_LOG_LEVEL) {
      const errorData = { name: error?.name, message: error?.message, code: error?.code };
      console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'ERROR', message, error: errorData, ...data }));
      if (process.env.NODE_ENV === 'production') {
        Sentry.captureException(error, { tags: { context: message }, extra: data });
      }
    }
  },

  critical(message, error, data = {}) {
    if (LOG_LEVELS.CRITICAL >= MIN_LOG_LEVEL) {
      const errorData = { name: error?.name, message: error?.message };
      console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'CRITICAL', message, error: errorData, ...data }));
      if (process.env.NODE_ENV === 'production') {
        Sentry.captureException(error, { level: 'fatal', tags: { critical: true }, extra: data });
      }
    }
  },
};

export function requestLogger(req, res, next) {
  const startTime = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  setRequestContext(req, { requestId, startTime });

  const originalJson = res.json.bind(res);
  res.json = function(data) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    if (req.path !== '/health' && req.path !== '/api/health' && statusCode !== 304) {
      logger.info(`${req.method} ${req.path}`, {
        requestId,
        method: req.method,
        path: req.path,
        statusCode,
        durationMs: duration,
      });
    }

    if (duration > 1000) {
      logger.warn(`Slow: ${req.method} ${req.path}`, { durationMs: duration });
    }

    clearRequestContext(req);
    return originalJson(data);
  };

  next();
}

export function errorLogger(err, req, res, next) {
  const context = getRequestContext(req);
  let statusCode = err.statusCode || 500;

  if (err?.timeout || err?.name === 'FetchTimeoutError') statusCode = 504;

  logger.error(`${req.method} ${req.path}`, err, { statusCode, requestId: context.requestId });

  clearRequestContext(req);

  // Sind die Header schon raus, kann nur noch Express' Default-Handler die
  // Verbindung sauber schliessen — dann weiterreichen. Andernfalls antworten
  // wir hier abschliessend und rufen next() NICHT mehr auf: ein next(err) nach
  // gesendeter Antwort laesst den Default-Handler den Socket zerstoeren und
  // liefert auf Vercel abgeschnittene Responses.
  if (res.headersSent) {
    return next(err);
  }

  // 'Interner Fehler' ist die im Backend durchgaengig verwendete generische
  // Meldung (maps.js, admin.js, sync.js) — die Route-Details bleiben im Log.
  res.status(statusCode).json({
    error: statusCode === 504 ? 'Zeitüberschreitung' : 'Interner Fehler',
    requestId: context.requestId,
  });
}

// @sentry/node v10 hat die alten `Sentry.Handlers.*`-Middlewares (v7-Ära)
// ersatzlos entfernt — ein Zugriff darauf wirft `Cannot read properties of
// undefined` und haette beim gesetzten SENTRY_DSN den kompletten Server-Boot
// (server.js ruft initSentry beim Modul-Laden) scheitern lassen. In v10
// instrumentiert Sentry.init() Express selbst; gemeldet werden Fehler ohnehin
// explizit ueber logger.error/critical (Sentry.captureException).
export function initSentry() {
  if (!process.env.SENTRY_DSN || process.env.NODE_ENV !== 'production') return false;
  try {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: 'production',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    });
    return true;
  } catch (e) {
    // Ein kaputtes Monitoring darf die API nie mitreissen.
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      message: 'Sentry-Initialisierung fehlgeschlagen',
      error: { name: e?.name, message: e?.message },
    }));
    return false;
  }
}

export default logger;
