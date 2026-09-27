import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Crown, Zap, Star, Sparkles, Mail, Loader2, ShoppingBag, Smartphone, RefreshCw, AlertTriangle, ChevronRight, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { functions, premium, ai } from "@/api/frontendClient";
import { auth } from "@/api/auth";
import {
  startGooglePlayPurchase,
  isGooglePlayBillingAvailable,
  restoreGooglePlayPurchases
} from "@/components/premium/googlePlayBilling";
import WebCheckoutButton from "@/components/premium/WebCheckoutButton";
import AiVolumeCard from "@/components/premium/AiVolumeCard";
import PageTitle from "@/components/layout/PageTitle";
import { useBuddyPreferences } from "@/lib/BuddyPreferencesContext";
import { DETAIL_OPTIONS } from "@/lib/buddyPreferences";
import { useTool } from "@/hooks/useTool";
import { getPlanLevel } from "@/components/premium/planHierarchy";
import { PLAN_TIERS, capabilityRows, formatTokens } from "@/lib/planAiCapabilities";
import { SUPPORT_EMAIL } from "@/lib/supportContact";

// Offener Stripe-Kauf, dessen Aktivierung noch nicht bestätigt ist. Zwischen
// "bei Stripe bezahlt" und "serverseitig freigeschaltet" liegt ein API-Aufruf;
// scheitert der (Funkloch, Server kurz weg), wäre das Geld weg und der Plan
// nicht aktiv. Deshalb wird der Kauf lokal gemerkt und bei jedem Öffnen der
// Seite erneut aktiviert, bis der Server ihn bestätigt oder eindeutig ablehnt.
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
  } catch {
    return null;
  }
}

function writePendingCheckout(planId, sessionId) {
  try {
    localStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify({
      planId, sessionId, createdAt: Date.now()
    }));
  } catch { /* Ohne localStorage bleibt nur der direkte Versuch */ }
}

function clearPendingCheckout() {
  try {
    localStorage.removeItem(PENDING_CHECKOUT_KEY);
  } catch { /* ignore */ }
}

// 400/403 sind endgültige Ablehnungen (Zahlung gehört zu anderem Plan/Konto) —
// ein erneuter Versuch würde daran nichts ändern. Alles andere (Netzfehler,
// 402 noch nicht verbucht, 5xx) darf und soll wiederholt werden.
function isPermanentActivationRejection(error) {
  return error?.status === 400 || error?.status === 403;
}

export default function PremiumPlans() {
  const [user, setUser] = useState(null);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processingPlan, setProcessingPlan] = useState(null);
  const [billingAvailable, setBillingAvailable] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedPlanId, setSelectedPlanId] = useState('pro');
  const [aiUsage, setAiUsage] = useState(null);
  const { buddy, saveBuddy } = useBuddyPreferences();
  const { getTool } = useTool();

  useEffect(() => {
    loadData();
    loadPaymentMethods();
    setBillingAvailable(isGooglePlayBillingAvailable());
  }, []);

  // Rücksprung vom Stripe-Checkout: /PremiumPlans?checkout=success&plan_id=...
  // &session_id=cs_... — die Aktivierung läuft serverseitig verifiziert über
  // /api/premium/activate. Params sofort entfernen, damit ein Reload die
  // Aktivierung nicht erneut anstößt (der Server ist zusätzlich idempotent).
  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (!checkout) {
      // Kein Rücksprung, aber evtl. ein Kauf, dessen Aktivierung beim letzten
      // Mal nicht durchkam: still nachholen.
      const pending = readPendingCheckout();
      if (pending) finalizeStripeCheckout(pending.planId, pending.sessionId, { silent: true });
      return;
    }
    const planId = searchParams.get('plan_id');
    const sessionId = searchParams.get('session_id');
    setSearchParams({}, { replace: true });

    if (checkout === 'cancelled') {
      toast.info('Kauf abgebrochen');
      return;
    }
    if (checkout === 'success' && planId && sessionId) {
      finalizeStripeCheckout(planId, sessionId);
    }
  }, []);

  const finalizeStripeCheckout = async (planId, sessionId, { silent = false } = {}) => {
    // Zuerst merken, dann aktivieren: bricht der Aufruf ab, ist der bezahlte
    // Kauf trotzdem festgehalten.
    writePendingCheckout(planId, sessionId);
    setProcessingPlan(planId);
    try {
      const response = await functions.invoke('activatePlan', {
        plan_id: planId,
        transaction_id: sessionId,
        payment_method: 'stripe'
      });
      const data = response?.data ?? response;
      if (!data?.ok) {
        throw new Error(data?.error || 'Plan-Aktivierung fehlgeschlagen');
      }
      clearPendingCheckout();
      toast.success('Plan aktiviert', {
        description: 'Deine Zahlung wurde bestätigt. Dein Premium-Plan ist jetzt aktiv.'
      });
      await loadData();
      window.dispatchEvent(new CustomEvent('plan-updated'));
    } catch (error) {
      if (isPermanentActivationRejection(error)) {
        clearPendingCheckout();
        toast.error('Aktivierung fehlgeschlagen', {
          description: `${error.message} — bitte kontaktiere den Support.`,
          duration: 10000
        });
      } else if (!silent) {
        // Der Kauf bleibt gespeichert und wird beim nächsten Öffnen erneut
        // versucht — das muss der Nutzer wissen, damit er nicht doppelt zahlt.
        toast.error('Aktivierung noch nicht bestätigt', {
          description: 'Deine Zahlung ist bei Stripe eingegangen. Die Freischaltung wird automatisch erneut versucht, sobald du die Premium-Seite öffnest.',
          duration: 10000
        });
      }
    } finally {
      setProcessingPlan(null);
    }
  };

  // Welche Zahlungswege der Server verifizieren kann. Bei einem Fehler bleibt
  // der Wert null und die Kauf-Schaltflächen werden nicht gesperrt (fail-open):
  // ein Ausfall dieser Abfrage darf keinen Verkauf verhindern.
  const loadPaymentMethods = async () => {
    try {
      const config = await premium.config();
      if (config?.payment_methods) setPaymentMethods(config.payment_methods);
    } catch (error) {
      console.error('[PremiumPlans] Zahlungswege konnten nicht geladen werden:', error);
    }
  };

  // KI-Volumen (Monatsstand + Volumen je Plan). Ein Fehler blendet nur die
  // Volumen-Anzeige aus, die Seite bleibt voll nutzbar.
  const loadAiUsage = async () => {
    try {
      const usage = await ai.usage();
      if (usage?.ok) setAiUsage(usage);
    } catch (error) {
      console.error('[PremiumPlans] KI-Volumen konnte nicht geladen werden:', error);
    }
  };

  const loadData = async () => {
    try {
      const currentUser = await auth.me();
      setUser(currentUser);
      loadAiUsage();

      const planStatusResponse = await functions.invoke('getPlanStatus');
      const planPayload = planStatusResponse?.data ?? planStatusResponse;
      if (planPayload && planPayload.plan) {
        setCurrentPlan(planPayload.plan);
      } else {
        setCurrentPlan({ id: 'free', name: 'Kostenlos' });
      }
    } catch (error) {
      console.error("[PremiumPlans] Fehler beim Laden:", error);
      setCurrentPlan({ id: 'free', name: 'Kostenlos' });
    }
    setLoading(false);
  };

  const handlePlayStorePurchase = async (planId) => {
    setProcessingPlan(planId);
    try {
      const result = await startGooglePlayPurchase(planId);

      if (result.success && result.activated) {
        toast.success('Plan aktiviert', {
          description: 'Dein Premium-Plan ist jetzt aktiv.'
        });
        await loadData();
        window.dispatchEvent(new CustomEvent('plan-updated'));
      } else if (result.cancelled) {
        toast.info('Kauf abgebrochen');
      } else if (result.pending) {
        toast.info('Kauf wird verarbeitet', {
          description: 'Falls der Kauf erfolgreich war, nutze "Käufe wiederherstellen".',
          duration: 8000
        });
      } else {
        toast.error('Kauf nicht möglich', {
          description: result.error || 'Unbekannter Fehler',
          duration: 6000
        });
      }
    } catch (error) {
      toast.error('Fehler', {
        description: error.message || 'Unbekannter Fehler'
      });
    } finally {
      setProcessingPlan(null);
    }
  };

  const handleRestorePurchases = async () => {
    setRestoring(true);
    try {
      const result = await restoreGooglePlayPurchases();

      if (result.success && result.restored > 0) {
        toast.success('Käufe wiederhergestellt', {
          description: result.message || `Plan ${result.planId} aktiviert.`
        });
        await loadData();
        window.dispatchEvent(new CustomEvent('plan-updated'));
      } else if (result.success) {
        toast.info('Keine Käufe gefunden', {
          description: result.message || 'Es wurden keine aktiven Google Play Käufe gefunden.'
        });
      } else {
        toast.error('Wiederherstellung fehlgeschlagen', {
          description: result.error,
          duration: 6000
        });
      }
    } catch (error) {
      toast.error('Fehler', {
        description: error.message || 'Unbekannter Fehler'
      });
    } finally {
      setRestoring(false);
    }
  };

  // Pläne bewusst nach Funktionswert priorisiert: Free ist werbefinanziert und
  // enthält nur die Einstiegs-Funktionen (der KI-Buddy ist dabei, aber
  // eingeschränkt). Die wirklich starken KI-, AR- und Analyse-Features steigen
  // mit dem Preis. Preise sind Source-of-Truth-gespiegelt in
  // backend/src/routes/premium.js (CHECKOUT_PLANS/PRODUCTS).
  const plans = [
    {
      id: 'free',
      tagline: 'Einfach testen',
      name: 'Free',
      price: 0,
      icon: UserIcon,
      color: 'from-gray-600 to-gray-700',
      description: 'Kostenlos mit Werbung - zum Reinschnuppern',
      features: [
        'Mit Werbeeinblendungen',
        'KI-Buddy Chat eingeschraenkt (5 Nachrichten/Tag)',
        'Digitales Fangbuch (unbegrenzt)',
        'Angelkarte mit Community-Spots (Basis)',
        'Schonzeiten & Mindestmasse nachschlagen',
        'Angelschein-Pruefungsvorbereitung (Quiz)',
        'AR-Knotenassistent',
        'Aktuelles Wetter (heute)',
        'Community-Feed lesen'
      ]
    },
    {
      id: 'basic',
      tagline: 'Solide Basis',
      name: 'Basic',
      price: 8.99,
      icon: Zap,
      color: 'from-blue-600 to-cyan-600',
      description: 'Werbefrei mit vollem KI-Buddy',
      popular: false,
      features: [
        'Alles aus Free - komplett werbefrei',
        'KI-Buddy Chat ohne Tageslimit (im KI-Volumen)',
        'KI-Foto-Analyse von Faengen',
        'Wetter 5 Tage + Wetter-Alarme',
        'Eigene Spots speichern & verwalten',
        'Fang-Statistiken (CatchStats)',
        'Gewaesser-Wasseranalyse',
        'Trip-Planer mit KI-Unterstuetzung',
        'Angelbedarf-Marktplatz (UsedGear)'
      ]
    },
    {
      id: 'pro',
      tagline: 'Für ambitionierte Angler',
      name: 'Pro',
      price: 18,
      icon: Star,
      color: 'from-purple-600 to-violet-600',
      description: 'Vollstaendige KI- & AR-Power',
      popular: true,
      features: [
        'Alles aus Basic',
        'KI-Fangprognosen & Hotspot-Erkennung',
        'Satelliten-Gewaesseranalyse (Echtdaten)',
        'AR-Gewaesser-Ansicht 3D & 3D-Koederanimation',
        'Tiefenkarten & Bathymetrie-Crowdsourcing',
        'Geraete-Integration (Echolot, Bissanzeiger)',
        'KI-Koeder-Mischer',
        'Digitale Lizenzverwaltung',
        'Community-Ranking, Clans & Events',
        'Fang-Export (PDF)',
        'KI-Trip-Detailbericht'
      ]
    },
    {
      id: 'elite',
      tagline: 'Maximale Power',
      name: 'Ultimate',
      price: 36,
      icon: Crown,
      color: 'from-amber-500 to-orange-600',
      description: 'Alles inklusive - jede Funktion, groesstes KI-Volumen',
      popular: false,
      features: [
        'Alles aus Pro - jede Funktion freigeschaltet',
        'KI Voice Live Chat (nur Ultimate)',
        'Live-Bissanzeiger per Smartphone-Kamera',
        'KI-Kamera: Echtzeit-Fischerkennung',
        'CatchCam - KI-Analyse direkt vom Foto',
        'Weibliche KI-Stimme "Matilda" (ElevenLabs)',
        'KI-Buddy Chat & Foto-Analyse mit groesstem KI-Volumen',
        'KI-Fangprognosen & Gewaesseranalyse (Open-Meteo)',
        '3D-Koederfuehrung, AR-Gewaesser & AR-Knotenassistent',
        'Tiefenkarten, Wasseranalyse & KI-Koeder-Mischer',
        'Geraete-Integration (Echolot, Bissanzeiger)',
        'Live-Trip-Tracking, Trip-Planer & Lizenzverwaltung',
        'Community-Ranking, Clans, Events & Marktplatz',
        'Spot-Gruppen teilen, Profi-Analyse & Fang-Export',
        'Priorisierte KI-Antworten & frueher Feature-Zugang',
        '3 Freundes-Einladungen inklusive',
        '10 EUR Rabatt auf deinen naechsten Ultimate-Plan pro Freund, der Basic kauft (bis zu 3x = 30 EUR)',
        'Alle weiteren App-Funktionen ohne Einschraenkung'
      ]
    },
    {
      id: 'friends',
      name: 'Freundschaft',
      price: 150,
      priceLabel: '150 / Jahr',
      icon: Sparkles,
      color: 'from-emerald-600 to-teal-600',
      description: 'Ultimate als Jahresabo mit Einladungen',
      popular: false,
      yearly: true,
      features: [
        'Alles aus Ultimate (12 Monate)',
        'Freundes-Einladungen inklusive',
        'Gemeinsame Spot-Gruppen mit Freunden',
        'Geteilte Fangbuecher & Statistiken',
        'Freunde zu Clans & Events einladen',
        'Gruppen-Ranking & Team-Challenges',
        '~72% Ersparnis gegenueber monatlichem Ultimate'
      ]
    }
  ];

  // Kann der Server den hier angebotenen Zahlungsweg überhaupt verifizieren?
  // Wenn nicht, würde der Nutzer erst bezahlen und danach eine Fehlermeldung
  // bekommen — dann lieber vorher sperren. null = noch unbekannt/Abfrage
  // fehlgeschlagen: dann nicht sperren.
  const purchasesEnabled = paymentMethods === null
    ? true
    : Boolean(billingAvailable ? paymentMethods.google_play : paymentMethods.stripe);

  const tierPlans = PLAN_TIERS.map(({ planId }) => plans.find(plan => plan.id === planId));
  const friendsPlan = plans.find(plan => plan.id === 'friends');
  const currentId = currentPlan?.id || 'free';
  const selected = plans.find(plan => plan.id === selectedPlanId) || tierPlans[2];
  const voiceTool = getTool('voice-buddy');
  const rows = capabilityRows({
    voiceRequiredPlanRank: getPlanLevel(voiceTool?.requires || 'basic'),
    tokenQuotas: aiUsage?.plan_quotas || null,
  });
  // Volumen des gewählten Plans (Server-Wert, Schlüssel = Plan-ID).
  const selectedQuota = aiUsage?.plan_quotas?.[selected.id];
  const isUltimateActive = getPlanLevel(currentId) >= getPlanLevel('elite');

  const selectPlan = (planId) => {
    setSelectedPlanId(planId);
    requestAnimationFrame(() => {
      document.getElementById('plan-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const formatPrice = (price) => price === 0
    ? '0 €'
    : `${Number(price).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

  // Referral-Rabatt (10 € je eingeladenem Freund, der Basic kauft) gilt nur für
  // den Ultimate-Plan und nur beim Web-Checkout. Betrag kommt aus dem
  // Plan-Status (ultimate_discount_cents).
  const discountEuro = Math.min((currentPlan?.ultimate_discount_cents || 0) / 100, 30);
  const showUltimateDiscount = selected.id === 'elite' && !billingAvailable && discountEuro > 0;
  const selectedPrice = showUltimateDiscount ? Math.max(selected.price - discountEuro, 9.99) : selected.price;
  const isProcessing = processingPlan === selected.id;
  const isSelectedCurrent = currentId === selected.id;

  if (loading) {
    return (
      <div className="bb-page flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="flex items-center gap-3" style={{ color: 'var(--bb-cyan)' }}>
          <Loader2 size={24} className="animate-spin" />
          <span>Lädt …</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bb-page">
      <div className="max-w-5xl mx-auto w-full min-w-0 grid gap-5">
        <PageTitle
          title="Tarif & KI-Zugriff"
          subtitle="Wähle den passenden Plan für dein Angelerlebnis. Mehr Möglichkeiten. Mehr Fänge."
          script="Bessere Entscheidungen. Mehr Fische."
        />

        {/* Plan-Kacheln */}
        <div className="bb-plan-tiles" role="list" aria-label="Tarife">
          {tierPlans.map((plan, index) => {
            const tierLabel = PLAN_TIERS[index].label;
            const Icon = plan.icon;
            const isCurrent = currentId === plan.id;
            const recommended = plan.id === 'pro';
            const isUltimate = plan.id === 'elite';
            return (
              <div
                key={plan.id}
                role="listitem"
                className={`bb-plan-tile${recommended ? ' is-recommended' : ''}${isUltimate ? ' is-ultimate' : ''}${selected.id === plan.id ? ' is-selected' : ''}`}
              >
                {recommended && <span className="bb-plan-badge">Empfohlen</span>}
                <Icon size={30} aria-hidden="true" className="bb-plan-tile-icon" />
                <strong className="bb-plan-tile-name">{tierLabel}</strong>
                <span className="bb-plan-tile-desc">{plan.tagline}</span>
                <span className="bb-plan-tile-price">{formatPrice(plan.price)}</span>
                <span className="bb-plan-tile-period">{plan.price === 0 ? 'Für Einsteiger' : '/ Monat'}</span>
                {isCurrent ? (
                  <span className="bb-plan-tile-btn is-current">Aktuell</span>
                ) : plan.price === 0 ? (
                  <span className="bb-plan-tile-btn is-current">Kostenlos</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => selectPlan(plan.id)}
                    className={`bb-plan-tile-btn${recommended ? ' is-primary' : ''}`}
                  >
                    {recommended ? 'Upgraden' : 'Upgrade'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* KI-Funktionen je Tarif */}
        <section className="bb-card bb-ai-table-card" aria-labelledby="ai-table-title">
          <div className="bb-ai-table-scroll">
            <table className="bb-ai-table">
              <caption id="ai-table-title" className="sr-only">KI-Funktionen je Tarif</caption>
              <colgroup>
                <col className="bb-ai-col-label" />
                {PLAN_TIERS.map(({ planId }) => <col key={planId} />)}
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">KI-Funktion</th>
                  {PLAN_TIERS.map(({ planId, label }) => (
                    <th key={planId} scope="col" className={`is-${planId}`}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <th scope="row" title={row.hint}>{row.label}</th>
                    {row.cells.map((cell, i) => (
                      <td key={PLAN_TIERS[i].planId}>
                        <span className={`bb-ai-dots level-${cell.level}`} aria-hidden="true">
                          {cell.level === 3 ? <><i /><i /><i /></> : <i />}
                        </span>
                        <span>{cell.text}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Antwortlaenge (gespeichert in den Buddy-Einstellungen) */}
        {user && (
          <section className="bb-card bb-detail-card" aria-labelledby="detail-title">
            <div className="bb-detail-row">
              <h2 id="detail-title" className="bb-detail-title">Antwortlänge</h2>
              <div className="bb-segment" role="radiogroup" aria-labelledby="detail-title">
                {DETAIL_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={buddy.detail === option.id}
                    className={buddy.detail === option.id ? 'is-active' : ''}
                    onClick={() => saveBuddy({ ...buddy, detail: option.id })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="bb-detail-hint">Legt die Länge und Detailtiefe der KI-Antworten fest. Der Umfang pro Stufe hängt von deinem Tarif ab.</p>
          </section>
        )}

        {/* Monatsstand des KI-Volumens */}
        {user && <AiVolumeCard usage={aiUsage} />}

        {/* Ultimate-Hinweis */}
        {isUltimateActive ? (
          <section className="bb-ultimate-banner" aria-label="Ultimate aktiv">
            <Crown size={40} aria-hidden="true" className="bb-ultimate-crown" />
            <span className="flex-1 min-w-0">
              <strong>Ultimate: Premium-KI-Tools aktiv</strong>
              <span>Du hast Zugriff auf alle KI-Funktionen, Analysen und den Voice-Buddy.</span>
            </span>
          </section>
        ) : (
          <button type="button" className="bb-ultimate-banner" onClick={() => selectPlan('elite')}>
            <Crown size={40} aria-hidden="true" className="bb-ultimate-crown" />
            <span className="flex-1 min-w-0 text-left">
              <strong>Ultimate: alle Premium-KI-Tools</strong>
              <span>Maximale Kontexttiefe, proaktive Tipps und das größte KI-Volumen.</span>
            </span>
            <ChevronRight size={26} aria-hidden="true" />
          </button>
        )}

        {/* Hinweise zum Zahlungsweg */}
        {!purchasesEnabled && (
          <div className="bb-card bb-card-warn flex items-start gap-3" role="alert">
            <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm text-amber-100">
              <strong className="block mb-1">Kauf derzeit nicht moeglich</strong>
              {billingAvailable
                ? 'Die Kaufabwicklung ueber Google Play ist gerade nicht verfuegbar. Bitte versuche es spaeter erneut oder kontaktiere den Support.'
                : 'Die Bezahlung im Browser ist gerade nicht verfuegbar. Bitte versuche es spaeter erneut oder kontaktiere den Support.'}
            </div>
          </div>
        )}
        {!billingAvailable && purchasesEnabled && (
          <div className="bb-card flex items-start gap-3">
            <Smartphone size={20} className="text-cyan-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm text-cyan-100">
              <strong className="block mb-1">Bezahlung im Browser</strong>
              Du kannst Premium-Plaene direkt hier mit Kreditkarte (Visa, Mastercard, Amex), Google Pay oder Apple Pay bezahlen.
              In der Android-App ist zusaetzlich Google Play Billing verfuegbar.
            </div>
          </div>
        )}

        {/* Details + Kauf des gewaehlten Plans */}
        <section id="plan-detail" className={`bb-card bb-plan-detail${selected.id === 'elite' ? ' is-ultimate' : ''}`} aria-labelledby="plan-detail-title">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="plan-detail-title" className="bb-plan-detail-name">{selected.id === 'free' ? 'Gast' : selected.name}</h2>
              <p className="bb-plan-detail-desc">{selected.description}</p>
            </div>
            <div className="text-right shrink-0">
              {showUltimateDiscount && (
                <span className="block text-sm line-through" style={{ color: 'var(--bb-muted)' }}>{formatPrice(selected.price)}</span>
              )}
              <strong className="bb-plan-detail-price">{formatPrice(selectedPrice)}</strong>
              {selected.price > 0 && <span className="block text-xs" style={{ color: 'var(--bb-muted)' }}>{selected.yearly ? 'pro Jahr' : 'pro Monat'}</span>}
            </div>
          </div>
          {showUltimateDiscount && (
            <p className="mt-2 text-sm font-semibold text-emerald-400">Freundschafts-Rabatt: {formatPrice(discountEuro)} gespart</p>
          )}
          <ul className="bb-plan-features">
            {typeof selectedQuota === 'number' && (
              <li><Check size={16} aria-hidden="true" />KI-Volumen: {formatTokens(selectedQuota)} Buddy-Tokens pro Monat</li>
            )}
            {selected.features.map(feature => (
              <li key={feature}><Check size={16} aria-hidden="true" />{feature}</li>
            ))}
          </ul>
          {isSelectedCurrent ? (
            <span className="bb-pill-success">Aktiver Plan{currentPlan?.remaining_days ? ` – noch ${currentPlan.remaining_days} Tage` : ''}</span>
          ) : selected.price > 0 && (
            <div className="grid gap-2">
              {billingAvailable ? (
                <button
                  type="button"
                  onClick={() => handlePlayStorePurchase(selected.id)}
                  disabled={isProcessing || !purchasesEnabled}
                  className="bb-action bb-action-block"
                >
                  {isProcessing ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <ShoppingBag size={18} aria-hidden="true" />}
                  {isProcessing ? 'Kauf wird gestartet …' : 'Im Play Store kaufen'}
                </button>
              ) : (
                <WebCheckoutButton planId={selected.id} disabled={isProcessing || !purchasesEnabled} />
              )}
            </div>
          )}
        </section>

        {/* Jahresabo */}
        {friendsPlan && (
          <button
            type="button"
            className={`bb-card bb-dash-row text-left${selected.id === 'friends' ? ' is-selected' : ''}`}
            onClick={() => selectPlan('friends')}
          >
            <span className="bb-dash-row-media"><Sparkles size={28} aria-hidden="true" /></span>
            <span className="flex-1 min-w-0">
              <span className="bb-dash-row-label">Jahresabo mit Einladungen</span>
              <strong className="bb-dash-row-title">{friendsPlan.name}</strong>
              <span className="bb-dash-row-meta">{formatPrice(friendsPlan.price)} pro Jahr · {friendsPlan.description}</span>
            </span>
            <ChevronRight size={22} aria-hidden="true" />
          </button>
        )}

        {billingAvailable && (
          <button onClick={handleRestorePurchases} disabled={restoring} className="bb-secondary justify-center">
            {restoring ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
            {restoring ? 'Wird wiederhergestellt …' : 'Käufe wiederherstellen'}
          </button>
        )}

        <section className="bb-card text-center grid gap-3">
          <h2 className="text-lg font-semibold text-white flex items-center justify-center gap-2">
            <Mail size={20} aria-hidden="true" style={{ color: 'var(--bb-cyan)' }} />
            Fragen zu Premium?
          </h2>
          <p className="text-sm" style={{ color: 'var(--bb-muted)' }}>
            Kontaktiere uns per E-Mail bei Fragen zu den Premium-Plänen oder zum Google Play Kauf.
          </p>
          <button
            onClick={() => {
              window.location.href = `mailto:${SUPPORT_EMAIL}?subject=Premium Anfrage&body=Hallo,%0D%0A%0D%0AIch interessiere mich für einen Premium-Plan.%0D%0A%0D%0AMeine E-Mail: ${user?.email || ''}`;
            }}
            className="bb-secondary justify-self-center"
          >
            <Mail size={16} aria-hidden="true" />
            Support kontaktieren
          </button>
          <p className="text-xs" style={{ color: 'var(--bb-muted)' }}>
            {billingAvailable
              ? 'Alle Kaeufe erfolgen ueber deinen Google Play Account. Verwaltung & Kuendigung in den Play Store Einstellungen.'
              : 'Bezahlung per Kreditkarte, Google Pay oder Apple Pay laeuft sicher ueber Stripe.'}
          </p>
        </section>
      </div>
    </div>
  );
}
