import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { api } from '@/api/frontendClient';

const RETRY_DELAY_MS = 500;
const MAX_RETRIES = 6; // 3 Sekunden insgesamt

export default function AuthCallback() {
  const [status, setStatus] = useState('Anmeldung wird verarbeitet...');
  const [searchParams] = useSearchParams();

  useEffect(() => {
    let unsubscribed = false;
    let attempts = 0;

    // Versucht, die Session zu holen mit Wiederholungslogik.
    // Supabase braucht manchmal kurz, um die Session nach dem Redirect zu setzen.
    const tryGetSession = async () => {
      if (unsubscribed) return;

      attempts++;
      console.log('[AuthCallback] Attempt', attempts, 'to get session...');
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('[AuthCallback] Session error:', sessionError.message);
        setStatus('Fehler: ' + sessionError.message);
        return;
      }

      if (data.session?.access_token) {
        // Session vorhanden → Token speichern und zum Dashboard gehen
        console.log('[AuthCallback] Session found! Setting tokens and redirecting to Dashboard');
        console.log('[AuthCallback] Access token:', data.session.access_token.slice(0, 20) + '...');
        api.setToken(data.session.access_token);
        if (data.session.refresh_token) api.setRefreshToken(data.session.refresh_token);
        console.log('[AuthCallback] Tokens set in localStorage, redirecting...');
        if (!unsubscribed) {
          window.location.replace('/Dashboard');
        }
        return;
      }

      // Retry: Session noch nicht da, aber wir haben noch Versuche
      if (attempts < MAX_RETRIES) {
        console.log('[AuthCallback] No session yet, retrying in', RETRY_DELAY_MS, 'ms...');
        setTimeout(tryGetSession, RETRY_DELAY_MS);
        return;
      }

      // Letzer Versuch fehlgeschlagen → auf onAuthStateChange warten
      console.log('[AuthCallback] Max retries reached, waiting for onAuthStateChange...');
      setStatus('Warte auf Authentifizierung...');
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (unsubscribed) return;
          console.log('[AuthCallback] onAuthStateChange:', event, 'has token:', !!session?.access_token);
          if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.access_token) {
            console.log('[AuthCallback] Setting tokens from auth state change and redirecting');
            api.setToken(session.access_token);
            if (session.refresh_token) api.setRefreshToken(session.refresh_token);
            subscription.unsubscribe();
            unsubscribed = true;
            window.location.replace('/Dashboard');
          }
        }
      );

      // Timeout für den Listener
      const timeout = setTimeout(() => {
        if (!unsubscribed) {
          subscription.unsubscribe();
          setStatus('Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
        }
      }, 10000);

      return () => {
        unsubscribed = true;
        subscription.unsubscribe();
        clearTimeout(timeout);
      };
    };

    const handleAuthFlow = async () => {
      try {
        await tryGetSession();
      } catch (err) {
        console.error('[AuthCallback Error]', err);
        if (!unsubscribed) {
          setStatus('Ein Fehler ist aufgetreten. Bitte aktualisiere die Seite.');
        }
      }
    };

    handleAuthFlow();

    return () => {
      unsubscribed = true;
    };
  }, [searchParams]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-gray-700 border-t-cyan-400 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white text-sm">{status}</p>
      </div>
    </div>
  );
}
