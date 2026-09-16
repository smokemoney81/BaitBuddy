import React, { useState } from 'react';
import { auth } from '@/api/auth';
import { supabase } from '@/api/supabaseClient';
import { createPageUrl } from '@/utils';
import { buildPublicUrl } from '@/lib/publicUrl';
import { Browser } from '@capacitor/browser';

export default function OAuthMigrationModal({ user, onClose }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Wenn bereits mit OAuth verlinkt, nicht anzeigen
  if (user?.oauth_linked) {
    return null;
  }

  async function openOAuthUrl(url) {
    const browserAvailable =
      typeof window !== 'undefined' && window.Capacitor?.isPluginAvailable?.('Browser');
    if (browserAvailable) {
      try {
        await Browser.open({ url, windowName: '_system' });
        return;
      } catch (err) {
        console.warn('[OAuth] Browser.open failed, falling back to window.open:', err);
      }
    }
    const opened = window.open(url, '_system');
    if (!opened) {
      window.location.href = url;
    }
  }

  async function handleMigrateToGoogle() {
    setLoading(true);
    setError('');

    try {
      const isNative =
        typeof window !== 'undefined' &&
        (window.Capacitor?.isNativePlatform?.() || window.capacitor?.platform);
      const redirectUrl = isNative
        ? 'app://baitbuddy/auth/callback'
        : buildPublicUrl('/OAuthLinkingCallback');

      // Starte OAuth-Flow
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: isNative,
        },
      });

      if (oauthError) {
        setError('OAuth-Fehler: ' + oauthError.message);
        setLoading(false);
        return;
      }

      if (isNative && data?.url) {
        await openOAuthUrl(data.url);
      }
      // Browser: Supabase leitet automatisch weiter
    } catch (err) {
      console.error('[Migration OAuth Error]', err);
      setError('Fehler beim Verbinden: ' + err.message);
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 rounded-2xl border border-white/10 p-6 max-w-sm w-full">
        <h2 className="text-xl font-bold text-white mb-2">Sicherheit erhöhen</h2>
        <p className="text-gray-400 text-sm mb-6">
          Verbinde dein Konto mit Google für eine einfachere und sicherere Anmeldung.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-gray-800 text-gray-400 font-medium text-sm hover:bg-gray-700 disabled:opacity-50 transition-all"
          >
            Später
          </button>
          <button
            type="button"
            onClick={handleMigrateToGoogle}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-medium text-sm hover:from-cyan-400 hover:to-blue-400 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Wird verbunden...
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Mit Google fortfahren
              </>
            )}
          </button>
        </div>

        <p className="text-center text-xs text-gray-600 mt-4">
          Du kannst dich danach mit Email oder Google anmelden
        </p>
      </div>
    </div>
  );
}
