import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';
import { auth } from "@/api/auth";
import { createPageUrl } from '@/utils';
import LanguageSwitcher from '@/components/i18n/LanguageSwitcher';
import { LanguageProvider } from '@/components/i18n/LanguageContext';
import DeleteAccountSection from '@/components/settings/DeleteAccountSection';
import LandingAuthPanel from '@/components/home/LandingAuthPanel';
import LandingPitch from '@/components/home/LandingPitch';
import { maybeShowEventPopup, EVENT_POPUP_DWELL_MS } from '@/lib/loginEventPopup';

function LandingPageContent() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [showDeleteAccount, setShowDeleteAccount] = useState(false);

    useEffect(() => {
        auth.isAuthenticated().then(setIsAuthenticated).catch(() => setIsAuthenticated(false));

        // Referral-Code aus der URL (?ref=CODE) persistieren — beim ersten Login
        // löst ReferralInvitePopup den Code ein und schaltet die 7-Tage-Belohnung
        // für den Einladenden frei.
        try {
            const params = new URLSearchParams(window.location.search);
            const ref = params.get('ref');
            if (ref) {
                const cleaned = ref.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
                if (cleaned) localStorage.setItem('bb_pending_referral_code', cleaned);
            }
        } catch { /* Storage optional */ }

        const prevBg = document.body.style.backgroundColor;
        const prevHtmlBg = document.documentElement.style.backgroundColor;
        document.body.style.backgroundColor = '#081d22';
        document.documentElement.style.backgroundColor = '#081d22';
        return () => {
            document.body.style.backgroundColor = prevBg;
            document.documentElement.style.backgroundColor = prevHtmlBg;
        };
    }, []);

    // Button "Zum Dashboard" fuer bereits angemeldete Nutzer.
    const handleLogin = async () => {
        try {
            const isAuth = await auth.isAuthenticated();
            if (!isAuth) {
                auth.redirectToLogin(createPageUrl('Dashboard'));
                return;
            }
            if (await maybeShowEventPopup()) {
                await new Promise(resolve => setTimeout(resolve, EVENT_POPUP_DWELL_MS));
            }
            window.location.href = createPageUrl('Dashboard');
        } catch (error) {
            console.error('Login error:', error);
            auth.redirectToLogin(createPageUrl('Dashboard'));
        }
    };

    return (
        <div className="bb-landing">
            <div className="bb-landing-lang">
                <LanguageSwitcher />
            </div>

            <main className="bb-landing-inner">
                {/* Hero aus der Design-Vorlage: Unterwasserszene mit Logo, Schriftzug und Hecht. */}
                <header className="bb-landing-hero">
                    <h1 className="sr-only">BaitBuddy – Fish smarter</h1>
                    <img
                        src="/assets/welcome/welcome-hero.webp"
                        alt=""
                        width="704"
                        height="1019"
                        decoding="async"
                    />
                </header>

                {isAuthenticated ? (
                    <div className="bb-landing-auth">
                        <LandingPitch />
                        <button type="button" onClick={handleLogin} className="bb-landing-btn is-cta">
                            <LayoutDashboard className="bb-landing-btn-icon" aria-hidden="true" />
                            <span>Zum Dashboard</span>
                        </button>
                        {showDeleteAccount ? (
                            <div className="bb-landing-delete">
                                <DeleteAccountSection />
                                <button type="button" onClick={() => setShowDeleteAccount(false)} className="bb-landing-link">Abbrechen</button>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setShowDeleteAccount(true)} className="bb-landing-link is-danger">Konto löschen</button>
                        )}
                    </div>
                ) : (
                    <LandingAuthPanel />
                )}

                <footer className="bb-landing-legal">
                    <Link to="/Datenschutz">Datenschutz</Link>
                    <Link to="/Impressum">Impressum</Link>
                    <Link to="/AGB">AGB</Link>
                </footer>
            </main>
        </div>
    );
}

export default function LandingPage() {
    return (
        <LanguageProvider>
            <LandingPageContent />
        </LanguageProvider>
    );
}
