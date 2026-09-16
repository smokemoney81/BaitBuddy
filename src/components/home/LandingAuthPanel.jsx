import React, { useState, useEffect } from 'react';
import { auth } from '@/api/auth';
import { supabase } from '@/api/supabaseClient';
import { createPageUrl } from '@/utils';
import { setGuestSession } from '@/components/utils/guestMode';
import { isOnline } from '@/utils/networkStatus';
import { buildPublicUrl } from '@/lib/publicUrl';
import { maybeShowEventPopup, EVENT_POPUP_DWELL_MS } from '@/lib/loginEventPopup';
import { Browser } from '@capacitor/browser';
import { Eye, EyeOff } from 'lucide-react';
import OAuthMigrationModal from '@/components/auth/OAuthMigrationModal';

// Anmelde-/Registrierungs-Panel der Landing Page.
// Aus src/pages/Home.jsx extrahiert: acht zusammenhaengende State-Felder und
// fuenf Handler, die ausschliesslich diesem Panel dienen. Getrennt, damit der
// Auth-Pfad ohne die uebrige Landing Page (WaterScene, Feature-Karussell,
// Tutorial-Modal) gerendert und getestet werden kann.

const INPUT_CLASS =
  'w-full bg-gray-800/90 border border-gray-600 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-400 outline-none focus:border-cyan-400 focus:bg-gray-800 focus:ring-2 focus:ring-cyan-400/30 transition-all';

// Nach erfolgreichem Login/Registrierung ins Dashboard. Ein voller
// Seitenwechsel (statt React-Router-Navigation) ist hier gewollt: er baut den
// App-Zustand mit der frischen Sitzung neu auf.
async function goToDashboard() {
  const popupShown = await maybeShowEventPopup();
  if (popupShown) {
    await new Promise((resolve) => setTimeout(resolve, EVENT_POPUP_DWELL_MS));
  }
  window.location.href = createPageUrl('Dashboard');
}

// Oeffnet die OAuth-URL im externen System-Browser. Bevorzugt das
// @capacitor/browser-Plugin (Custom Tab), faellt aber robust auf window.open
// zurueck, falls das Plugin im installierten Container fehlt (z. B. aeltere
// Beta-APK, die die Live-Site laedt) — sonst schlaegt der Login mit
// "'Browser' plugin is not implemented on android" fehl.
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
  // Fallback: Capacitor-Core leitet externe URLs via onCreateWindow an den
  // System-Browser weiter (kein Browser-Plugin noetig).
  const opened = window.open(url, '_system');
  if (!opened) {
    window.location.href = url;
  }
}

export default function LandingAuthPanel() {
  const [loginMode, setLoginMode] = useState('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginName, setLoginName] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginInfo, setLoginInfo] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState(null);

  useEffect(() => {
    const onOAuthError = (e) =>
      setLoginError('Social Login fehlgeschlagen: ' + (e.detail?.message || 'Unbekannter Fehler'));
    window.addEventListener('baitbuddy:oauth-error', onOAuthError);
    return () => window.removeEventListener('baitbuddy:oauth-error', onOAuthError);
  }, []);

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    setLoginInfo('');
    // Ohne Verbindung laesst sich keine neue Sitzung aufbauen. Ein zuvor
    // angemeldeter Nutzer landet dank Offline-Auth gar nicht erst hier; ein
    // Erstlogin braucht jedoch das Netz — dann klare Rueckmeldung geben.
    if (!isOnline()) {
      setLoginError('Keine Internetverbindung. Zum Anmelden ist eine Verbindung erforderlich.');
      setLoginLoading(false);
      return;
    }
    try {
      if (loginMode === 'login') {
        await auth.login(loginEmail, loginPassword);
      } else {
        await auth.register(loginEmail, loginPassword, loginName);
      }

      // Nach erfolgreichem Email-Login: User-Daten laden
      const user = await auth.me();
      setLoggedInUser(user);

      // Zeige Migration-Modal, falls noch nicht mit OAuth verlinkt
      if (!user?.oauth_linked) {
        setShowMigrationModal(true);
      } else {
        // Wenn bereits verlinkt: direkt zum Dashboard
        await goToDashboard();
      }
    } catch (err) {
      const errorMsg =
        err.data?.error || err.message || 'Anmeldung fehlgeschlagen. Bitte prüfe deine Zugangsdaten.';
      setLoginError(errorMsg);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setLoginError('');
    setLoginInfo('');
    if (!loginEmail) {
      setLoginError('Bitte zuerst deine E-Mail-Adresse oben eingeben.');
      return;
    }
    setLoginLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, {
        redirectTo: buildPublicUrl('/ResetPassword'),
      });
      if (error) throw error;
      setLoginInfo(
        'Falls ein Konto mit dieser E-Mail existiert, haben wir dir einen Link zum Zurücksetzen geschickt. Bitte prüfe deinen Posteingang (auch Spam).'
      );
    } catch (err) {
      setLoginError(err.message || 'Senden fehlgeschlagen. Bitte später erneut versuchen.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSocialLogin = async (provider) => {
    setLoginError('');
    const isNative =
      typeof window !== 'undefined' &&
      (window.Capacitor?.isNativePlatform?.() || window.capacitor?.platform);
    const redirectUrl = isNative
      ? 'app://baitbuddy/auth/callback'
      : buildPublicUrl('/AuthCallback');

    try {
      if (isNative) {
        // Native: skipBrowserRedirect + externer Browser fuer OAuth.
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
        });
        if (error) {
          setLoginError('Social Login fehlgeschlagen: ' + error.message);
          return;
        }
        if (data?.url) {
          await openOAuthUrl(data.url);
        }
      } else {
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: redirectUrl },
        });
        if (error) setLoginError('Social Login fehlgeschlagen: ' + error.message);
      }
    } catch (err) {
      console.error('[OAuth Error]', err);
      setLoginError('Social Login Fehler: ' + err.message);
    }
  };

  const handleGuestLogin = () => {
    setGuestSession({ is_guest: true });
    window.location.href = createPageUrl('Dashboard');
  };

  return (
    <>
      {showMigrationModal && (
        <OAuthMigrationModal
          user={loggedInUser}
          onClose={async () => {
            setShowMigrationModal(false);
            await goToDashboard();
          }}
        />
      )}
      <div className="w-full max-w-[320px] bg-black/75 backdrop-blur-2xl border border-white/10 rounded-2xl p-5 shadow-2xl pointer-events-auto order-1 lg:order-1">
      <h2 className="text-center text-base font-bold text-white mb-4">
        {loginMode === 'login' ? 'Willkommen bei BaitBuddy' : 'Konto erstellen'}
      </h2>

      <div className="flex flex-col gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => handleSocialLogin('google')}
            disabled={loginLoading}
            className="flex items-center justify-center gap-2.5 w-full py-2.5 px-4 rounded-xl bg-white/10 text-white font-medium text-sm border border-white/20 hover:bg-white/20 hover:border-white/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="currentColor"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="currentColor"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="currentColor"/>
            </svg>
            Mit Google fortfahren
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-white/15" />
        <span className="text-xs text-gray-500">oder</span>
        <div className="flex-1 h-px bg-white/15" />
      </div>

      <form onSubmit={handleEmailAuth} className="flex flex-col gap-2">
        {loginMode === 'register' && (
          <input
            type="text"
            value={loginName}
            onChange={(e) => setLoginName(e.target.value)}
            placeholder="Vollständiger Name"
            required
            className={INPUT_CLASS}
          />
        )}
        <input
          type="email"
          value={loginEmail}
          onChange={(e) => setLoginEmail(e.target.value)}
          placeholder="E-Mail Adresse"
          required
          className={INPUT_CLASS}
        />
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            placeholder="Passwort"
            required
            className="w-full bg-gray-800/90 border border-gray-600 rounded-xl pl-4 pr-11 py-2.5 text-white text-sm placeholder-gray-400 outline-none focus:border-cyan-400 focus:bg-gray-800 focus:ring-2 focus:ring-cyan-400/30 transition-all"
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {loginMode === 'login' && (
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={loginLoading}
            className="self-end text-xs text-cyan-400 hover:text-cyan-300 disabled:opacity-50 transition-colors"
          >
            Passwort vergessen?
          </button>
        )}
        {loginError && <p role="alert" className="text-red-400 text-xs text-center">{loginError}</p>}
        {loginInfo && <p role="status" className="text-emerald-400 text-xs text-center">{loginInfo}</p>}
        <button
          type="submit"
          disabled={loginLoading}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-semibold text-sm hover:from-cyan-400 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-0.5"
        >
          {loginLoading ? 'Bitte warten...' : loginMode === 'login' ? 'Anmelden' : 'Registrieren'}
        </button>
      </form>

      <p className="text-center text-xs text-gray-500 mt-3">
        {loginMode === 'login' ? 'Noch kein Konto?' : 'Bereits ein Konto?'}{' '}
        <button
          type="button"
          onClick={() => {
            setLoginMode((m) => (m === 'login' ? 'register' : 'login'));
            setLoginError('');
          }}
          className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
        >
          {loginMode === 'login' ? 'Registrieren' : 'Anmelden'}
        </button>
      </p>

      <div className="flex items-center gap-3 mt-4">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-xs text-gray-600">oder</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      <button
        type="button"
        onClick={handleGuestLogin}
        className="w-full mt-3 py-2.5 rounded-xl bg-transparent text-gray-400 text-sm font-medium border border-white/10 hover:border-white/20 hover:text-gray-300 transition-all"
      >
        Als Gast fortfahren
      </button>
      <p className="text-center text-[10px] text-gray-600 mt-1.5">
        Eingeschränkte Funktionen · Keine Registrierung nötig
      </p>
    </div>
    </>
  );
}
