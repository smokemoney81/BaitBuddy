import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { auth } from '@/api/auth';

const RETRY_DELAY_MS = 500;
const MAX_RETRIES = 6;

export default function OAuthLinkingCallback() {
  const [status, setStatus] = useState('OAuth-Verknüpfung wird verarbeitet...');
  const [searchParams] = useSearchParams();

  useEffect(() => {
    let unsubscribed = false;
    let attempts = 0;

    const tryLinkOAuth = async () => {
      if (unsubscribed) return;

      attempts++;
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          // Retry bei Fehler
          if (attempts < MAX_RETRIES) {
            setTimeout(tryLinkOAuth, RETRY_DELAY_MS);
            return;
          }
          setStatus('Fehler: ' + sessionError.message);
          setTimeout(() => {
            if (typeof window !== 'undefined') {
              window.location.href = '/Dashboard';
            }
          }, 2000);
          return;
        }

        if (data.session?.access_token) {
          // Session da → mit Linking-Versuch
          try {
            await auth.linkOAuth('google');
            if (!unsubscribed) {
              setStatus('Erfolgreich verbunden! Wird weitergeleitet...');
              setTimeout(() => {
                if (typeof window !== 'undefined') {
                  window.location.href = '/Dashboard';
                }
              }, 1500);
            }
          } catch (linkErr) {
            console.warn('[OAuthLinking] linkOAuth failed, but proceeding:', linkErr);
            // Auch wenn linkOAuth fehlschlägt, war das OAuth erfolgreich
            // → weiterleiten ohne zu blockieren
            if (!unsubscribed) {
              setStatus('Verknüpfung geklärt. Wird weitergeleitet...');
              setTimeout(() => {
                if (typeof window !== 'undefined') {
                  window.location.href = '/Dashboard';
                }
              }, 1000);
            }
          }
          return;
        }

        // Session noch nicht da → Retry
        if (attempts < MAX_RETRIES) {
          setTimeout(tryLinkOAuth, RETRY_DELAY_MS);
          return;
        }

        // Letzter Retry: auf onAuthStateChange warten
        setStatus('Warte auf Authentifizierung...');
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, session) => {
            if (unsubscribed) return;
            if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.access_token) {
              auth.linkOAuth('google')
                .then(() => {
                  subscription.unsubscribe();
                  unsubscribed = true;
                  setStatus('Erfolgreich verbunden! Wird weitergeleitet...');
                  setTimeout(() => {
                    if (typeof window !== 'undefined') {
                      window.location.href = '/Dashboard';
                    }
                  }, 1500);
                })
                .catch((err) => {
                  console.error('linkOAuth failed:', err);
                  subscription.unsubscribe();
                  unsubscribed = true;
                  setStatus('Authentifiziert. Wird weitergeleitet...');
                  setTimeout(() => {
                    if (typeof window !== 'undefined') {
                      window.location.href = '/Dashboard';
                    }
                  }, 1000);
                });
            }
          }
        );

        const timeout = setTimeout(() => {
          if (!unsubscribed) {
            subscription.unsubscribe();
            setStatus('Timeout. Wird zum Dashboard geleitet...');
            setTimeout(() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/Dashboard';
              }
            }, 1000);
          }
        }, 10000);

        return () => {
          unsubscribed = true;
          subscription.unsubscribe();
          clearTimeout(timeout);
        };
      } catch (err) {
        console.error('[OAuthLinking Error]', err);
        if (attempts < MAX_RETRIES) {
          setTimeout(tryLinkOAuth, RETRY_DELAY_MS);
        } else {
          setStatus('Fehler: ' + (err.message || 'Unbekannter Fehler'));
          setTimeout(() => {
            if (typeof window !== 'undefined') {
              window.location.href = '/Dashboard';
            }
          }, 2000);
        }
      }
    };

    const handleOAuthLinking = async () => {
      try {
        await tryLinkOAuth();
      } catch (err) {
        console.error('[OAuthLinking Wrapper Error]', err);
        setStatus('Ein unerwarteter Fehler ist aufgetreten.');
        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.location.href = '/Dashboard';
          }
        }, 2000);
      }
    };

    handleOAuthLinking();

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
