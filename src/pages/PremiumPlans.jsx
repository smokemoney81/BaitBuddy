import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Crown, Zap, Star, Sparkles, ChevronLeft, Loader2,
  RefreshCw, AlertTriangle, Smartphone, User, Fish, Check
} from "lucide-react";
import { functions, premium } from "@/api/frontendClient";
import { auth } from "@/api/auth";
import {
  startGooglePlayPurchase,
  isGooglePlayBillingAvailable,
  restoreGooglePlayPurchases
} from "@/components/premium/googlePlayBilling";
import WebCheckoutButton from "@/components/premium/WebCheckoutButton";

const PENDING_CHECKOUT_KEY = 'bb_pending_checkout';
const PENDING_CHECKOUT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function readPendingCheckout() {
  try {
    const raw = localStorage.getItem(PENDING_CHECKOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.planId || !parsed?.sessionId) return null;
    if (Date.now() - (parsed.createdAt || 0) > PENDING_CHECKOUT_MAX_AGE_MS) {
      localStorage.removeItem(PENDING_CHECKOUT_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

function writePendingCheckout(planId, sessionId) {
  try {
    localStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({ planId, sessionId, createdAt: Date.now() }));
  } catch {}
}

function clearPendingCheckout() {
  try { localStorage.removeItem(PENDING_CHECKOUT_KEY); } catch {}
}

function isPermanentActivationRejection(error) {
  return error?.status === 400 || error?.status === 403;
}

// KI comparison table data
const KI_FEATURES = [
  {
    icon: '🗄️',
    name: 'Kontexttiefe',
    gast:     { dots: 1, color: 'orange', label: 'Begrenzt\n(1–2 Quellen)' },
    basic:    { dots: 1, color: 'yellow', label: 'Standard\n(3–5 Quellen)' },
    pro:      { dots: 2, color: 'green',  label: 'Erweitert\n(5–10 Quellen)' },
    ultimate: { dots: 3, color: 'green',  label: 'Maximal\n(Alle Quellen)' },
  },
  {
    icon: '👤',
    name: 'Personalisierung',
    gast:     { dots: 1, color: 'orange', label: 'Keine\n(Standard)' },
    basic:    { dots: 1, color: 'yellow', label: 'Grundlegend\n(Profil)' },
    pro:      { dots: 2, color: 'green',  label: 'Erweitert\n(Verhalten & Spots)' },
    ultimate: { dots: 3, color: 'green',  label: 'Vollständig\n(KI lernt mit dir)' },
  },
  {
    icon: '⚡',
    name: 'Actions',
    gast:     { dots: 1, color: 'orange', label: 'Keine\n(Nur Antworten)' },
    basic:    { dots: 1, color: 'yellow', label: 'Begrenzt\n(einfache Aufgaben)' },
    pro:      { dots: 2, color: 'green',  label: 'Erweitert\n(z.B. Spots, Pläne)' },
    ultimate: { dots: 3, color: 'green',  label: 'Alle verfügbar\n(Automationen)' },
  },
  {
    icon: '🎤',
    name: 'Voice',
    gast:     { dots: 0, color: 'orange', label: 'Nicht\nverfügbar' },
    basic:    { dots: 1, color: 'yellow', label: 'Begrenzt\n(Kurze Eingaben)' },
    pro:      { dots: 2, color: 'green',  label: 'Vollständig\n(Spracheingabe & Antworten)' },
    ultimate: { dots: 3, color: 'green',  label: 'Erweitert\n(Voice + Live-Assistant)' },
  },
  {
    icon: '📊',
    name: 'Datenanalyse',
    gast:     { dots: 0, color: 'orange', label: 'Nicht\nverfügbar' },
    basic:    { dots: 1, color: 'yellow', label: 'Basis\n(Wetter & Spots)' },
    pro:      { dots: 2, color: 'green',  label: 'Erweitert\n(Muster, Prognosen)' },
    ultimate: { dots: 3, color: 'green',  label: 'Alle Analysen\n(KI-Modelle & Deep Insights)' },
  },
];

function DotIndicator({ count, color }) {
  const dotColor = color === 'green' ? '#00FF9D' : color === 'yellow' ? '#FFD60A' : '#FF6B35';
  return (
    <div className="flex gap-0.5 justify-center mb-0.5">
      {count === 0 ? (
        <div className="w-2 h-2 rounded-full" style={{ background: '#FF4560', opacity: 0.8 }} />
      ) : (
        Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full"
            style={{ background: i < count ? dotColor : 'rgba(255,255,255,0.12)' }}
          />
        ))
      )}
    </div>
  );
}

export default function PremiumPlans() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processingPlan, setProcessingPlan] = useState(null);
  const [billingAvailable, setBillingAvailable] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [answerLength, setAnswerLength] = useState('normal');

  useEffect(() => {
    loadData();
    loadPaymentMethods();
    setBillingAvailable(isGooglePlayBillingAvailable());
  }, []);

  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (!checkout) {
      const pending = readPendingCheckout();
      if (pending) finalizeStripeCheckout(pending.planId, pending.sessionId, { silent: true });
      return;
    }
    const planId = searchParams.get('plan_id');
    const sessionId = searchParams.get('session_id');
    setSearchParams({}, { replace: true });
    if (checkout === 'cancelled') { toast.info('Kauf abgebrochen'); return; }
    if (checkout === 'success' && planId && sessionId) finalizeStripeCheckout(planId, sessionId);
  }, []);

  const finalizeStripeCheckout = async (planId, sessionId, { silent = false } = {}) => {
    writePendingCheckout(planId, sessionId);
    setProcessingPlan(planId);
    try {
      const response = await functions.invoke('activatePlan', {
        plan_id: planId, transaction_id: sessionId, payment_method: 'stripe'
      });
      const data = response?.data ?? response;
      if (!data?.ok) throw new Error(data?.error || 'Plan-Aktivierung fehlgeschlagen');
      clearPendingCheckout();
      toast.success('Plan aktiviert', { description: 'Deine Zahlung wurde bestätigt.' });
      await loadData();
      window.dispatchEvent(new CustomEvent('plan-updated'));
    } catch (error) {
      if (isPermanentActivationRejection(error)) {
        clearPendingCheckout();
        toast.error('Aktivierung fehlgeschlagen', { description: error.message, duration: 10000 });
      } else if (!silent) {
        toast.error('Aktivierung noch nicht bestätigt', {
          description: 'Deine Zahlung ist eingegangen. Die Freischaltung wird automatisch erneut versucht.',
          duration: 10000
        });
      }
    } finally { setProcessingPlan(null); }
  };

  const loadPaymentMethods = async () => {
    try {
      const config = await premium.config();
      if (config?.payment_methods) setPaymentMethods(config.payment_methods);
    } catch {}
  };

  const loadData = async () => {
    try {
      const currentUser = await auth.me();
      setUser(currentUser);
      const planStatusResponse = await functions.invoke('getPlanStatus');
      const planPayload = planStatusResponse?.data ?? planStatusResponse;
      setCurrentPlan(planPayload?.plan || { id: 'free', name: 'Kostenlos' });
    } catch {
      setCurrentPlan({ id: 'free', name: 'Kostenlos' });
    }
    setLoading(false);
  };

  const handlePlayStorePurchase = async (planId) => {
    setProcessingPlan(planId);
    try {
      const result = await startGooglePlayPurchase(planId);
      if (result.success && result.activated) {
        toast.success('Plan aktiviert');
        await loadData();
        window.dispatchEvent(new CustomEvent('plan-updated'));
      } else if (result.cancelled) {
        toast.info('Kauf abgebrochen');
      } else if (result.pending) {
        toast.info('Kauf wird verarbeitet', { duration: 8000 });
      } else {
        toast.error('Kauf nicht möglich', { description: result.error });
      }
    } catch (error) {
      toast.error('Fehler', { description: error.message });
    } finally { setProcessingPlan(null); }
  };

  const handleRestorePurchases = async () => {
    setRestoring(true);
    try {
      const result = await restoreGooglePlayPurchases();
      if (result.success && result.restored > 0) {
        toast.success('Käufe wiederhergestellt');
        await loadData();
        window.dispatchEvent(new CustomEvent('plan-updated'));
      } else if (result.success) {
        toast.info('Keine Käufe gefunden');
      } else {
        toast.error('Wiederherstellung fehlgeschlagen', { description: result.error });
      }
    } catch (error) {
      toast.error('Fehler', { description: error.message });
    } finally { setRestoring(false); }
  };

  const purchasesEnabled = paymentMethods === null
    ? true
    : Boolean(billingAvailable ? paymentMethods.google_play : paymentMethods.stripe);

  const plans = [
    { id: 'free',    name: 'Gast',     sub: 'Einfach testen',      price: 0,    priceLabel: '0 €',      Icon: User,     color: 'border-white/10', btnLabel: 'Aktueller Plan', gold: false, rec: false },
    { id: 'basic',   name: 'Basic',    sub: 'Solide Basis',         price: 8.99, priceLabel: '8,99 €',   Icon: Fish,     color: 'border-cyan-500/20', btnLabel: 'Upgrade', gold: false, rec: false },
    { id: 'pro',     name: 'Pro',      sub: 'Für ambitionierte\nAngler', price: 18, priceLabel: '18,00 €', Icon: Star,   color: 'border-cyan-400', btnLabel: 'Jetzt upgraden', gold: false, rec: true },
    { id: 'elite',   name: 'Ultimate', sub: 'Maximale Power',       price: 36,   priceLabel: '36,00 €',  Icon: Crown,    color: 'border-amber-400/60', btnLabel: 'Upgrade', gold: true, rec: false },
  ];

  const kiData = {
    free:    KI_FEATURES.map(f => f.gast),
    basic:   KI_FEATURES.map(f => f.basic),
    pro:     KI_FEATURES.map(f => f.pro),
    elite:   KI_FEATURES.map(f => f.ultimate),
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#080F16' }}>
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  const discountEuro = Math.min((currentPlan?.ultimate_discount_cents || 0) / 100, 30);

  return (
    <div className="min-h-screen" style={{ background: '#080F16', color: '#eef5fa' }}>
      {/* Hero */}
      <div
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #0D2137 0%, #0a1a2b 55%, #080F16 100%)',
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 75% 30%, rgba(0,180,255,0.10) 0%, transparent 55%)' }}
        />
        {/* Back + logo */}
        <div className="relative flex items-center gap-3 px-4 pt-4 pb-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-full flex items-center justify-center border border-white/15 bg-white/5"
          >
            <ChevronLeft size={20} className="text-white/80" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <Fish size={14} className="text-cyan-400" />
              <span className="text-[13px] font-extrabold text-white leading-none">BaitBuddy</span>
            </div>
            <div className="text-[9px] text-cyan-400/80 tracking-widest uppercase">Mehr als Angeln</div>
          </div>
        </div>

        {/* Title area */}
        <div className="relative px-4 pt-5 pb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-extrabold text-white leading-tight mb-2">
                Tarif &amp; KI-Zugriff
              </h1>
              <p className="text-sm text-white/60 leading-relaxed max-w-[220px]">
                Wähle den passenden Plan für dein Angelerlebnis. Mehr Möglichkeiten. Mehr Fänge.
              </p>
            </div>
            <div className="text-right ml-3">
              <div className="text-[13px] italic font-semibold leading-snug" style={{ color: '#00E5FF' }}>
                Bessere<br />Entscheidungen.<br />Mehr Fische.
              </div>
            </div>
          </div>

          {billingAvailable && (
            <button
              type="button"
              onClick={handleRestorePurchases}
              disabled={restoring}
              className="mt-3 flex items-center gap-1.5 text-[11px] text-cyan-400/80 border border-cyan-500/20 rounded-full px-3 py-1"
            >
              {restoring ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
              Käufe wiederherstellen
            </button>
          )}
        </div>
      </div>

      <div className="px-3" style={{ paddingBottom: 'calc(100px + env(safe-area-inset-bottom))' }}>

        {/* Warning banner */}
        {!purchasesEnabled && (
          <div className="mb-4 p-3 rounded-2xl border border-amber-600/40 flex items-start gap-2.5"
            style={{ background: 'rgba(255,159,10,0.08)' }}>
            <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
            <div className="text-xs text-amber-100/80">
              <strong className="block mb-0.5">Kauf derzeit nicht möglich</strong>
              Bitte versuche es später erneut oder kontaktiere den Support.
            </div>
          </div>
        )}

        {/* Plan cards */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          {plans.map((plan) => {
            const Icon = plan.Icon;
            const isActive = currentPlan?.id === plan.id;
            const isProcessing = processingPlan === plan.id;
            const showDiscount = plan.id === 'elite' && !billingAvailable && discountEuro > 0;
            const discountedPrice = showDiscount ? Math.max(plan.price - discountEuro, 9.99).toFixed(2) : null;

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border flex flex-col items-center text-center p-2.5 transition-all ${plan.color}`}
                style={{
                  background: plan.rec
                    ? 'rgba(0,229,255,0.07)'
                    : plan.gold
                    ? 'rgba(180,130,0,0.08)'
                    : 'rgba(15,30,45,0.75)',
                  boxShadow: plan.rec ? '0 0 0 1.5px #00E5FF, 0 0 20px rgba(0,229,255,0.15)' : undefined,
                }}
              >
                {plan.rec && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-bold text-black"
                    style={{ background: '#00E5FF', whiteSpace: 'nowrap' }}
                  >
                    EMPFOHLEN
                  </div>
                )}

                <div className={`w-10 h-10 rounded-xl mb-2 flex items-center justify-center ${
                  plan.gold ? 'bg-amber-500/15' : plan.rec ? 'bg-cyan-500/15' : 'bg-white/8'
                }`}>
                  <Icon size={18} className={plan.gold ? 'text-amber-400' : plan.rec ? 'text-cyan-400' : 'text-white/60'} />
                </div>

                <div className={`text-xs font-bold mb-0.5 ${plan.gold ? 'text-amber-400' : plan.rec ? 'text-cyan-400' : 'text-white'}`}>
                  {plan.name}
                </div>
                <div className="text-[9px] text-white/40 leading-tight mb-2 whitespace-pre-line">{plan.sub}</div>

                <div className={`text-base font-extrabold mb-0.5 ${plan.gold ? 'text-amber-300' : 'text-white'}`}>
                  {showDiscount ? `${discountedPrice} €` : plan.priceLabel}
                </div>
                {plan.price > 0 && (
                  <div className="text-[9px] text-white/40 mb-2">/ Monat</div>
                )}

                {isActive ? (
                  <div className="w-full py-1.5 rounded-xl text-[10px] font-bold text-white/80 border border-white/15 bg-white/5">
                    Aktueller Plan
                  </div>
                ) : plan.price === 0 ? (
                  <div className="w-full py-1.5 rounded-xl text-[10px] font-bold text-white/40 border border-white/10">
                    Verfügbar
                  </div>
                ) : billingAvailable ? (
                  <button
                    type="button"
                    onClick={() => handlePlayStorePurchase(plan.id)}
                    disabled={isProcessing || !purchasesEnabled}
                    className={`w-full py-1.5 rounded-xl text-[10px] font-bold transition-all disabled:opacity-50 ${
                      plan.rec
                        ? 'text-black'
                        : plan.gold
                        ? 'text-amber-900 border border-amber-400/60'
                        : 'text-white border border-white/15 bg-white/5'
                    }`}
                    style={plan.rec ? { background: '#00E5FF' } : plan.gold ? { background: 'rgba(180,130,0,0.25)' } : undefined}
                  >
                    {isProcessing ? <Loader2 size={10} className="animate-spin mx-auto" /> : plan.btnLabel}
                  </button>
                ) : (
                  <WebCheckoutButton
                    planId={plan.id}
                    disabled={isProcessing || !purchasesEnabled}
                    className={`w-full py-1.5 rounded-xl text-[10px] font-bold ${
                      plan.rec ? 'text-black' : 'text-white border border-white/15 bg-white/5'
                    }`}
                    style={plan.rec ? { background: '#00E5FF' } : undefined}
                    label={isProcessing ? '...' : plan.btnLabel}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* KI-FUNKTIONEN comparison table */}
        <div className="rounded-2xl border border-white/8 overflow-hidden mb-5" style={{ background: 'rgba(15,30,45,0.75)' }}>
          {/* Table header */}
          <div className="grid grid-cols-5 border-b border-white/8">
            <div className="px-3 py-2.5">
              <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">KI-FUNKTIONEN</span>
            </div>
            {['Gast', 'Basic', 'Pro', 'Ultimate'].map((h, i) => (
              <div key={h} className={`py-2.5 text-center border-l border-white/8 ${i === 2 ? 'text-cyan-400' : i === 3 ? 'text-amber-400' : 'text-white/60'}`}>
                <span className="text-[10px] font-bold">{h}</span>
              </div>
            ))}
          </div>

          {/* Feature rows */}
          {KI_FEATURES.map((feature, rowIdx) => {
            const cells = [feature.gast, feature.basic, feature.pro, feature.ultimate];
            return (
              <div
                key={feature.name}
                className={`grid grid-cols-5 border-b border-white/5 ${rowIdx === KI_FEATURES.length - 1 ? 'border-b-0' : ''}`}
              >
                <div className="px-3 py-3 flex items-start gap-1.5">
                  <span className="text-[12px] mt-0.5">{feature.icon}</span>
                  <span className="text-[11px] font-medium text-white/80">{feature.name}</span>
                </div>
                {cells.map((cell, colIdx) => (
                  <div key={colIdx} className="py-3 px-1 text-center border-l border-white/5 flex flex-col items-center justify-center">
                    <DotIndicator count={cell.dots} color={cell.color} />
                    <div className="text-[9px] text-white/40 leading-tight whitespace-pre-line">{cell.label}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* Antwortlänge selector */}
        <div className="rounded-2xl border border-white/8 p-4 mb-5" style={{ background: 'rgba(15,30,45,0.75)' }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-bold text-white">Antwortlänge</div>
              <div className="text-[11px] text-white/40">(für diesen Plan)</div>
            </div>
            <div className="flex gap-1.5">
              {['kurz', 'normal', 'detailliert'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setAnswerLength(opt)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold capitalize transition-all ${
                    answerLength === opt
                      ? 'text-black'
                      : 'text-white/60 border border-white/15 bg-white/5'
                  }`}
                  style={answerLength === opt ? { background: '#00E5FF' } : undefined}
                >
                  {opt.charAt(0).toUpperCase() + opt.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-white/40 leading-relaxed">
            Legt die Länge und Detailtiefe der KI-Antworten fest. Die Verfügbarkeit hängt von deinem Tarif ab.
          </p>
        </div>

        {/* Ultimate banner */}
        <div
          className="rounded-2xl border border-amber-400/30 p-4 flex items-center gap-3"
          style={{ background: 'rgba(180,130,0,0.08)' }}
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <Crown size={20} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-amber-400 mb-0.5">Ultimate: Premium-KI-Tools aktiv</div>
            <div className="text-[11px] text-white/50 leading-relaxed">
              Du erhältst Zugriff auf alle KI-Funktionen, Analysen, Actions und den erweiterten Voice-Assistant.
            </div>
          </div>
          <ChevronLeft size={16} className="text-white/30 rotate-180 shrink-0" />
        </div>

        {/* Payment method info */}
        {!billingAvailable && (
          <div className="mt-4 p-3 rounded-2xl border border-cyan-500/20 flex items-start gap-2.5"
            style={{ background: 'rgba(0,229,255,0.05)' }}>
            <Smartphone size={14} className="text-cyan-400 mt-0.5 shrink-0" />
            <div className="text-[11px] text-white/60">
              Im Browser kannst du mit Kreditkarte, Google Pay oder Apple Pay bezahlen.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
