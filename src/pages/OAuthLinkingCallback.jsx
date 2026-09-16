import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { auth } from '@/api/auth';

export default function OAuthLinkingCallback() {
  const [status, setStatus] = useState('OAuth-Verknüpfung wird verarbeitet...');
  const [searchParams] = useSearchParams();

  useEffect(() => {
    let unsubscribed = false;

    const handleOAuthLinking = async () => {
      if (unsubscribed) return;

      try {
        // Holt die neue Session von Supabase nach OAuth
        const { data, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          setStatus('Fehler: ' + sessionError.message);
          setTimeout(() => {
            if (typeof window !== 'undefined') {
              window.location.href = '/Dashboard';
            }
          }, 2000);
          return;
        }

        if (data.session?.access_token) {
          // Nutzer ist jetzt mit Google in Supabase
          // Markiere das im Backend, dass der Link vollständig ist
          await auth.linkOAuth('google');

          if (!unsubscribed) {
            setStatus('Erfolgreich verbunden! Wird weitergeleitet...');
            setTimeout(() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/Dashboard';
              }
            }, 1500);
          }
          return;
        }

        // Fallback: Warte auf onAuthStateChange
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, session) => {
            if (unsubscribed) return;
            if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.access_token) {
              auth.linkOAuth('google').then(() => {
                subscription.unsubscribe();
                unsubscribed = true;
                setStatus('Erfolgreich verbunden! Wird weitergeleitet...');
                setTimeout(() => {
                  if (typeof window !== 'undefined') {
                    window.location.href = '/Dashboard';
                  }
                }, 1500);
              }).catch((err) => {
                console.error('linkOAuth failed:', err);
                setStatus('Fehler beim Speichern. Trotzdem weiterleiten...');
                setTimeout(() => {
                  if (typeof window !== 'undefined') {
                    window.location.href = '/Dashboard';
                  }
                }, 2000);
              });
            }
          }
        );

        const timeout = setTimeout(() => {
          if (!unsubscribed) {
            subscription.unsubscribe();
            setStatus('Verknüpfung abgelaufen. Wird zum Dashboard geleitet...');
            setTimeout(() => {
              if (typeof window !== 'undefined') {
                window.location.href = '/Dashboard';
              }
            }, 2000);
          }
        }, 15000);

        return () => {
          unsubscribed = true;
          subscription.unsubscribe();
          clearTimeout(timeout);
        };
      } catch (err) {
        console.error('[OAuthLinking Error]', err);
        setStatus('Fehler: ' + (err.message || 'Unbekannter Fehler'));
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
