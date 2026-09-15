// ESM-kompatible Alternative zu express-async-errors.
// Fängt geworfene Fehler in async Route-Handlern auf und leitet sie an
// die Error-Middleware weiter.
import express from 'express';

export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

let patched = false;

// Monkey-patch der Express-Router-Methoden, damit jeder Handler automatisch
// gewrappt wird. Idempotent: mehrfaches Aufrufen wrappt nicht doppelt.
function patchRouter() {
  if (patched) return;
  patched = true;

  // WICHTIG: In Express 4 liegen die HTTP-Verb-Methoden NICHT auf
  // express.Router.prototype (das ist ein ungenutztes leeres Objekt), sondern
  // auf dem internen Prototyp der Router-Instanzen. Der frühere Patch auf
  // express.Router.prototype lief daher ins Leere und wrappte KEINEN Handler —
  // async-Fehler blieben ungefangen. Den echten Prototyp über eine
  // Wegwerf-Instanz holen; alle Router teilen ihn.
  const routerProto = Object.getPrototypeOf(express.Router());
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all'];

  methods.forEach(method => {
    const originalMethod = routerProto[method];
    routerProto[method] = function(...args) {
      // Letztes Argument ist der Handler (oder mehrere Handler)
      const lastIndex = args.length - 1;
      if (typeof args[lastIndex] === 'function') {
        args[lastIndex] = asyncHandler(args[lastIndex]);
      }
      return originalMethod.apply(this, args);
    };
  });
}

// WICHTIG: Der Patch wird bereits BEIM IMPORT angewendet — nicht erst bei einem
// späteren registerAsyncErrorHandling()-Aufruf. Route-Module rufen router.post(…)
// bereits während ihres eigenen Imports auf; würde der Patch erst nach den
// Route-Imports laufen, wären die Handler längst unumwickelt registriert und
// geworfene async-Fehler blieben ungefangen (der Request hinge bis zum
// Plattform-Timeout). Solange dieses Modul VOR den Route-Modulen importiert
// wird (siehe server.js), sind alle Handler abgesichert.
patchRouter();

// Rückwärtskompatibel: server.js ruft dies weiterhin auf. Dank Idempotenz und
// des Import-Zeit-Patches ist es ein sicherer No-op, falls schon gepatcht.
export function registerAsyncErrorHandling() {
  patchRouter();
}
