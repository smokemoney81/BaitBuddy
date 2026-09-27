import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { X, Download, Share } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const DISMISS_KEY = 'pwa_install_dismissed';
const DECLINED_KEY = 'pwa_install_declined';
const DISMISS_COOLDOWN_DAYS = 7;
const SHOW_DELAY_MS = 400;

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
    || document.referrer.includes('android-app://');
}

function isCapacitorNative() {
  if (typeof window === 'undefined') return false;
  const cap = window.Capacitor;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform();
  if (typeof cap.isNativePlatform === 'boolean') return cap.isNativePlatform;
  return false;
}

function isIOSSafari() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isSafari = /^((?!chrome|crios|fxios|edgios).)*safari/i.test(ua);
  return isIOS && isSafari;
}

function isCooldownActive() {
  if (localStorage.getItem(DECLINED_KEY) === 'true') return true;
  const dismissed = localStorage.getItem(DISMISS_KEY);
  if (!dismissed) return false;
  const days = (Date.now() - parseInt(dismissed, 10)) / (1000 * 60 * 60 * 24);
  return days < DISMISS_COOLDOWN_DAYS;
}

export default function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [mode, setMode] = useState(null);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    if (isStandaloneMode() || isCapacitorNative()) return;
    if (isCooldownActive()) return;

    let iosTimer = null;

    const handler = (e) => {
      if (isCooldownActive()) return;
      e.preventDefault();
      setDeferredPrompt(e);
      setMode('native');
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    if (isIOSSafari()) {
      iosTimer = setTimeout(() => {
        setMode((prev) => prev || 'ios');
        setShowPrompt((prev) => prev || true);
      }, SHOW_DELAY_MS);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, []);

  const handleInstall = async () => {
    if (mode === 'ios') {
      setShowIOSInstructions(true);
      return;
    }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } finally {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
      setDeferredPrompt(null);
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DECLINED_KEY, 'true');
    setShowPrompt(false);
  };

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-24 left-4 right-4 z-[100] sm:left-auto sm:right-6 sm:w-96"
          role="dialog"
          aria-labelledby="install-prompt-title"
        >
          <Card className="glass-morphism border-emerald-500/50 shadow-2xl shadow-emerald-500/20">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center">
                  <Download className="w-6 h-6 text-white" aria-hidden="true" />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 id="install-prompt-title" className="text-white font-semibold text-sm mb-1">
                    Moechtest du BaitBuddy installieren?
                  </h3>
                  {mode === 'ios' && showIOSInstructions ? (
                    <p className="text-gray-400 text-xs mb-3">
                      Tippe in Safari unten auf <Share className="inline w-3 h-3 mx-0.5 align-[-2px]" aria-hidden="true" /> Teilen und dann auf &bdquo;Zum Home-Bildschirm&ldquo;.
                    </p>
                  ) : (
                    <p className="text-gray-400 text-xs mb-3">
                      Schneller Zugriff vom Startbildschirm und Offline-Nutzung.
                    </p>
                  )}

                  <div className="flex gap-2">
                    {!showIOSInstructions && (
                      <Button
                        size="sm"
                        onClick={handleInstall}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-xs h-8"
                      >
                        Ja
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDismiss}
                      className="flex-1 text-xs h-8 border-gray-600 text-gray-300 hover:text-white"
                    >
                      Nein
                    </Button>
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDismiss}
                  aria-label="Install-Frage schliessen"
                  className="flex-shrink-0 h-6 w-6 text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
