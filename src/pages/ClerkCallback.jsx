import React, { useEffect, useRef, useState } from 'react';
import { useAuth, useClerk, ClerkFailed, ClerkLoaded } from '@clerk/react';
import BaitBuddyClerkProvider from '@/components/auth/BaitBuddyClerkProvider';
import { auth } from '@/api/frontendClient';
import { postLoginPath } from '@/lib/guestStore';
import { clerkPublishableKey } from '@/lib/clerkLogin';

// Rücksprung nach der Clerk-Anmeldung: tauscht die Clerk-Sitzung gegen die
// normale bb_token-Sitzung (POST /api/auth/clerk) und meldet Clerk danach ab —
// die App kennt danach nur noch bb_token/bb_refresh, wie nach einem
// Passwort-Login. Ein voller Seitenwechsel baut den App-Zustand neu auf.
const ERROR_KEY = 'bb_clerk_login_error';

function Exchange({ onError }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const clerk = useClerk();
  const started = useRef(false);

  useEffect(() => {
    if (!isLoaded || started.current) return;
    started.current = true;
    if (!isSignedIn) {
      onError('Die Anmeldung wurde nicht abgeschlossen. Bitte versuche es erneut.');
      return;
    }
    (async () => {
      try {
        const token = await getToken();
        await auth.loginWithClerk(token);
      } catch (err) {
        // Clerk-Sitzung verwerfen, damit ein neuer Versuch sauber beginnt.
        // signOut navigiert immer; der Text überlebt den Seitenwechsel in der
        // sessionStorage (nicht in der URL — sonst ließe sich über einen Link
        // beliebiger Text auf dieser Seite einblenden).
        const message = err?.data?.error || err?.message || 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.';
        try { sessionStorage.setItem(ERROR_KEY, message); } catch { /* ohne Storage: generischer Text */ }
        await clerk.signOut({ redirectUrl: '/ClerkCallback?error=1' }).catch(() => onError(message));
        return;
      }
      // Clerk abmelden und dabei direkt ins Dashboard (bzw. zur Gastdaten-
      // Übernahme) wechseln — signOut navigiert ohnehin selbst.
      const target = postLoginPath();
      await clerk.signOut({ redirectUrl: target }).catch(() => window.location.replace(target));
    })();
  }, [isLoaded, isSignedIn, getToken, clerk, onError]);

  return null;
}

function LoadFailed({ onError }) {
  useEffect(() => {
    onError('Die Anmeldung konnte nicht geladen werden. Bitte prüfe deine Verbindung und versuche es erneut.');
  }, [onError]);
  return null;
}

export default function ClerkCallback() {
  const [error, setError] = useState(() => {
    if (!clerkPublishableKey()) return 'Diese Anmeldung ist nicht eingerichtet.';
    try {
      if (new URLSearchParams(window.location.search).get('error') !== '1') return '';
      const message = sessionStorage.getItem(ERROR_KEY);
      sessionStorage.removeItem(ERROR_KEY);
      return message || 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.';
    } catch {
      return 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.';
    }
  });

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#0B1324] px-4">
      <div className="text-center max-w-sm">
        {error ? (
          <>
            <p role="alert" className="text-white text-sm mb-4">{error}</p>
            <a href="/" className="bb-landing-btn is-primary inline-flex">Zurück zur Anmeldung</a>
          </>
        ) : (
          <>
            <div className="w-8 h-8 border-4 border-gray-700 border-t-cyan-400 rounded-full animate-spin mx-auto mb-4" />
            <p role="status" className="text-white text-sm">Anmeldung wird verarbeitet …</p>
          </>
        )}
        {clerkPublishableKey() && !error && (
          <BaitBuddyClerkProvider>
            <ClerkLoaded><Exchange onError={setError} /></ClerkLoaded>
            <ClerkFailed><LoadFailed onError={setError} /></ClerkFailed>
          </BaitBuddyClerkProvider>
        )}
      </div>
    </div>
  );
}
