// ESM-kompatible Alternative zu express-async-errors.
// Fängt geworfene Fehler in async Route-Handlern auf und leitet sie an
// die Error-Middleware weiter.
import express from 'express';

export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

// Monkey-patch Express Router, um alle Handler automatisch zu wrappen
export function registerAsyncErrorHandling(app) {
  const Router = express.Router;
  const routerProto = Router.prototype;

  const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all'];

  methods.forEach(method => {
    const originalMethod = routerProto[method];
    routerProto[method] = function(...args) {
      // Letzes Argument ist der Handler (oder mehrere Handler)
      const lastIndex = args.length - 1;
      if (typeof args[lastIndex] === 'function') {
        args[lastIndex] = asyncHandler(args[lastIndex]);
      }
      return originalMethod.apply(this, args);
    };
  });
}
