import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Fish, BarChart3, GraduationCap, LayoutDashboard } from 'lucide-react';
import { auth } from "@/api/auth";
import { createPageUrl } from '@/utils';
import LanguageSwitcher from '@/components/i18n/LanguageSwitcher';
import { LanguageProvider } from '@/components/i18n/LanguageContext';
import DeleteAccountSection from '@/components/settings/DeleteAccountSection';
import LandingAuthPanel from '@/components/home/LandingAuthPanel';
import BuddyMascot from '@/components/home/BuddyMascot';
import { BrandMark } from '@/components/layout/BrandLogo';
import { maybeShowEventPopup, EVENT_POPUP_DWELL_MS } from '@/lib/loginEventPopup';

const FEATURES = [
    { icon: MapPin, label: 'Top-Spots finden' },
    { icon: Fish, label: 'Besser fangen' },
    { icon: BarChart3, label: 'Wetter & Daten nutzen' },
    { icon: GraduationCap, label: 'Immer dazulernen' },
];

// Fischbilder aus public/fish als dunkle Silhouetten im Unterwasser-Hintergrund.
const SWIMMERS = [
    { src: '/fish/pike.webp', className: 'is-left' },
    { src: '/fish/zander.webp', className: 'is-right' },
];

function LandingBackground() {
    return (
        <div className="bb-landing-bg" aria-hidden="true">
            <div className="bb-landing-sky" />
            <div className="bb-landing-waterline" />
            <div className="bb-landing-rays" />
            {SWIMMERS.map(fish => <img key={fish.src} src={fish.src} alt="" className={`bb-landing-swimmer ${fish.className}`} />)}
            <span className="bb-landing-bubbles" />
            <div className="bb-landing-floor" />
        </div>
    );
}

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
        document.body.style.backgroundColor = '#031525';
        document.documentElement.style.backgroundColor = '#031525';
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
            <LandingBackground />

            <div className="bb-landing-lang">
                <LanguageSwitcher />
            </div>

            <main className="bb-landing-inner">
                <header className="bb-landing-brand">
                    <span className="bb-landing-mark"><BrandMark size={112} /></span>
                    <h1 className="bb-landing-word">Bait<span>Buddy</span></h1>
                    <p className="bb-landing-claim">Dein persönlicher Angelbegleiter</p>
                    <p className="bb-script bb-landing-script" aria-hidden="true">Mehr als Angeln.</p>
                </header>

                <div className="bb-landing-buddy">
                    <span className="bb-landing-sonar" aria-hidden="true"><i /><i /><i /></span>
                    <BuddyMascot size={136} className="bb-landing-mascot" />
                    <p className="bb-landing-bubble">Hey, ich bin dein <strong>KI-Buddy</strong></p>
                </div>

                <ul className="bb-landing-features">
                    {FEATURES.map(({ icon: Icon, label }) => (
                        <li key={label}><Icon size={30} aria-hidden="true" /><span>{label}</span></li>
                    ))}
                </ul>

                {isAuthenticated ? (
                    <div className="bb-landing-auth">
                        <button type="button" onClick={handleLogin} className="bb-landing-btn is-primary">
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
