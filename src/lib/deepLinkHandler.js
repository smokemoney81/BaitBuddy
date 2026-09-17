import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from '@/api/supabaseClient';
import { api } from '@/api/frontendClient';

// Initialize deep-link listener at app startup (before Router renders)
export async function initializeDeepLinking() {
  if (typeof window === 'undefined') return;

  // Only on native platforms
  const isNative = window.Capacitor?.isNativePlatform?.() || window.capacitor?.platform;
  if (!isNative) return;

  try {
    if (!App?.addListener) return;

    // Handle deep-links that arrive while app is running
    const listener = await App.addListener('appUrlOpen', async (data) => {
      const url = data?.url;
      if (!url) return;

      console.log('[DeepLink] Received:', url);

      // Parse app://baitbuddy/auth/callback?code=...&state=... or #access_token=...
      if (url.includes('auth/callback')) {
        try {
          // Close the browser Custom Tab as promptly as possible.
          // Nur aufrufen, wenn das Plugin im Container verfügbar ist —
          // ältere Beta-APKs ohne @capacitor/browser würden sonst werfen.
          if (window.Capacitor?.isPluginAvailable?.('Browser')) {
            await Browser.close().catch(() => {});
          }

          const urlObj = new URL(url.replace('app://', 'https://'));
          const code = urlObj.searchParams.get('code');
          const error = urlObj.searchParams.get('error');
          const errorDescription = urlObj.searchParams.get('error_description');

          if (error) {
            const message = errorDescription ? decodeURIComponent(errorDescription) : error;
            console.error('[DeepLink] OAuth error:', message);
            window.dispatchEvent(new CustomEvent('baitbuddy:oauth-error', { detail: { message } }));
            return;
          }

          if (!code) {
            console.warn('[DeepLink] No code or error in URL');
            return;
          }

          console.log('[DeepLink] Exchanging PKCE code...');

          let sessionData, exchangeError;
          let attempts = 0;
          const maxAttempts = 3;

          // Retry-Logik für Code-Austausch (Netzwerk-Latenzen möglich)
          while (attempts < maxAttempts) {
            attempts++;
            try {
              const result = await Promise.race([
                supabase.auth.exchangeCodeForSession(code),
                new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('Code exchange timeout')), 10000)
                ),
              ]);
              sessionData = result.data;
              exchangeError = result.error;
              break;
            } catch (err) {
              if (attempts < maxAttempts) {
                console.log(`[DeepLink] Retry ${attempts}/${maxAttempts - 1}...`);
                await new Promise(r => setTimeout(r, 500));
              } else {
                exchangeError = err;
              }
            }
          }

          if (exchangeError) {
            console.error('[DeepLink] Code exchange failed:', exchangeError?.message || exchangeError?.toString?.() || 'Unknown error');
            window.dispatchEvent(new CustomEvent('baitbuddy:oauth-error', { detail: { message: exchangeError?.message || 'Code-Austausch fehlgeschlagen' } }));
            return;
          }

          if (sessionData?.session?.access_token) {
            console.log('[DeepLink] Session acquired, syncing tokens...');
            api.setToken(sessionData.session.access_token);
            if (sessionData.session.refresh_token) {
              api.setRefreshToken(sessionData.session.refresh_token);
            }
            console.log('[DeepLink] Redirecting to Dashboard');
            window.location.replace('/Dashboard');
          } else {
            console.warn('[DeepLink] No access_token in session');
            window.dispatchEvent(new CustomEvent('baitbuddy:oauth-error', { detail: { message: 'Keine Authentifizierungsdaten erhalten' } }));
          }
        } catch (e) {
          console.error('[DeepLink] Processing error:', e);
          window.dispatchEvent(new CustomEvent('baitbuddy:oauth-error', { detail: { message: e.message } }));
        }
      }
    });

    return listener;
  } catch (error) {
    console.error('[DeepLink] Initialization error:', error);
  }
}
