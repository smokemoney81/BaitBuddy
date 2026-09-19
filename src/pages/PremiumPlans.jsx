import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Zap, Star, Sparkles, Mail, Loader2, ShoppingBag, Smartphone, RefreshCw, AlertTriangle, X, Unlock } from "lucide-react";
import { toast } from "sonner";
import { functions, premium } from "@/api/frontendClient";
import { auth } from "@/api/auth";
import {
  startGooglePlayPurchase,
  isGooglePlayBillingAvailable,
  restoreGooglePlayPurchases
} from "@/components/premium/googlePlayBilling";
import WebCheckoutButton from "@/components/premium/WebCheckoutButton";

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

  const loadData = async () => {
    try {
      const currentUser = await auth.me();
      setUser(currentUser);

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
      name: 'Free',
      price: 0,
      icon: Check,
      color: 'from-gray-600 to-gray-700',
      description: 'Kostenlos mit Werbung - zum Reinschnuppern',
      features: [
        'Mit Werbeeinblendungen',
        'KI-Buddy Chat eingeschraenkt (5 Nachrichten/Tag)',
        'Digitales Fangbuch (unbegrenzt)',
        'Angelkarte mit Community-Spots (Basis)',
        'Schonzeiten & Mindestmasse nachschlagen',
        'Angelschein-Pruefungsvorbereitung (Quiz)',
        'Tutorials & AR-Knotenassistent',
        'Aktuelles Wetter (heute)',
        'Community-Feed lesen'
      ]
    },
    {
      id: 'basic',
      name: 'Basic',
      price: 8.99,
      icon: Zap,
      color: 'from-blue-600 to-cyan-600',
      description: 'Werbefrei mit vollem KI-Buddy',
      popular: false,
      features: [
        'Alles aus Free - komplett werbefrei',
        'KI-Buddy Chat unbegrenzt - BaitBuddy',
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
      name: 'Ultimate',
      price: 36,
      icon: Crown,
      color: 'from-amber-500 to-orange-600',
      description: 'Alles inklusive - jede Funktion ohne Limit',
      popular: false,
      features: [
        'Alles aus Pro - jede Funktion ohne Einschraenkung',
        'KI Voice Live Chat (nur Ultimate)',
        'Live-Bissanzeiger per Smartphone-Kamera',
        'KI-Kamera: Echtzeit-Fischerkennung',
        'CatchCam - KI-Analyse direkt vom Foto',
        'Weibliche KI-Stimme "Matilda" (ElevenLabs)',
        'KI-Buddy Chat & Foto-Analyse unbegrenzt',
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-cyan-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Lädt...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 p-6 pb-32">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-cyan-400 drop-shadow-[0_0_20px_rgba(34,211,238,0.8)] mb-4">
            Premium-Pläne
          </h1>
          <p className="text-gray-400 text-lg">
            Wähle den Plan, der am besten zu deinem Angel-Abenteuer passt
          </p>
          {currentPlan && currentPlan.id !== 'free' && (
            <div className="mt-4">
              <Badge className="bg-emerald-600 text-white">
                Aktueller Plan: {currentPlan.name}
                {currentPlan.remaining_days && ` - Noch ${currentPlan.remaining_days} Tage`}
              </Badge>
            </div>
          )}

          {billingAvailable && (
            <div className="mt-6">
              <Button
                onClick={handleRestorePurchases}
                disabled={restoring}
                variant="outline"
                className="border-cyan-500 text-cyan-400 hover:bg-cyan-500/10"
              >
                {restoring ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Wird wiederhergestellt...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Käufe wiederherstellen
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {!purchasesEnabled && (
          <div className="max-w-3xl mx-auto mb-8 p-4 rounded-xl border border-amber-700/50 bg-amber-900/20 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-100">
              <strong className="block mb-1">Kauf derzeit nicht moeglich</strong>
              {billingAvailable
                ? 'Die Kaufabwicklung ueber Google Play ist gerade nicht verfuegbar. Bitte versuche es spaeter erneut oder kontaktiere den Support.'
                : 'Die Bezahlung im Browser ist gerade nicht verfuegbar. Bitte versuche es spaeter erneut oder kontaktiere den Support.'}
            </div>
          </div>
        )}

        {!billingAvailable && purchasesEnabled && (
          <div className="max-w-3xl mx-auto mb-8 p-4 rounded-xl border border-cyan-700/50 bg-cyan-900/20 flex items-start gap-3">
            <Smartphone className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-cyan-100">
              <strong className="block mb-1">Bezahlung im Browser</strong>
              Du kannst Premium-Plaene direkt hier mit Kreditkarte (Visa, Mastercard, Amex), Google Pay oder Apple Pay bezahlen.
              In der Android-App ist zusaetzlich Google Play Billing verfuegbar.
            </div>
          </div>
        )}

        <div className="max-w-3xl mx-auto mb-8 p-4 rounded-xl border border-emerald-700/50 bg-emerald-900/20 flex items-start gap-3">
          <Unlock className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-100">
            <strong className="block mb-1">Alle Features freigegeben</strong>
            Durch die Integration weiterer Tools sind alle Premium-Features kostenfrei für dich freigeschaltet. Die gesamte App ist im vollständigen Umfang nutzbar - ohne Kauf notwendig.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const isCurrentPlan = currentPlan?.id === plan.id;
            const isProcessing = processingPlan === plan.id;

            // Referral-Rabatt (10€ je eingeladenem Freund, der Basic kauft) gilt
            // nur für den Ultimate-Plan und nur beim Web-Checkout. Betrag kommt
            // aus dem Plan-Status (ultimate_discount_cents).
            const discountEuro = Math.min(
              (currentPlan?.ultimate_discount_cents || 0) / 100,
              30
            );
            const showUltimateDiscount = plan.id === 'elite' && !billingAvailable && discountEuro > 0;
            const discountedPrice = showUltimateDiscount
              ? Math.max(plan.price - discountEuro, 9.99).toFixed(2)
              : null;

            return (
              <Card
                key={plan.id}
                className={`glass-morphism relative overflow-hidden ${
                  isCurrentPlan ? 'border-emerald-500 border-2' : 'border-gray-800'
                } ${plan.popular ? 'ring-2 ring-purple-500' : ''}`}
              >
                {plan.popular && (
                  <div className="absolute top-4 right-4">
                    <Badge className="bg-purple-600 text-white">
                      <Sparkles className="w-3 h-3 mr-1" />
                      Beliebt
                    </Badge>
                  </div>
                )}

                <CardHeader>
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${plan.color} flex items-center justify-center mb-4`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle className="text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.7)]">
                    {plan.name}
                  </CardTitle>
                  <p className="text-xs text-gray-400 mt-1">{plan.description}</p>
                  <CardDescription>
                    <div className="text-3xl font-bold text-white mt-2">
                      {plan.price === 0 ? 'Gratis' : (
                        <>
                          {showUltimateDiscount && (
                            <span className="text-lg text-gray-500 line-through mr-2 font-normal">
                              {plan.price}€
                            </span>
                          )}
                          {`${showUltimateDiscount ? discountedPrice : plan.price}€`}
                        </>
                      )}
                      {plan.price > 0 && (
                        <span className="text-sm text-gray-400 font-normal">
                          {plan.yearly ? '/Jahr' : '/Monat'}
                        </span>
                      )}
                    </div>
                    {showUltimateDiscount && (
                      <div className="mt-2 text-sm text-emerald-400 font-semibold">
                        Freundschafts-Rabatt: {discountEuro.toFixed(2)}€ gespart
                      </div>
                    )}
                    {plan.yearly && (
                      <div className="mt-1">
                        <Badge className="bg-emerald-700 text-white text-xs">Jahresplan</Badge>
                      </div>
                    )}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <ul className="space-y-3">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                        <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  {isCurrentPlan ? (
                    <Badge className="w-full justify-center py-2 bg-emerald-600 text-white">
                      ✓ Aktiver Plan
                    </Badge>
                  ) : plan.price === 0 ? (
                    <Badge variant="secondary" className="w-full justify-center py-2">
                      Kostenlos verfügbar
                    </Badge>
                  ) : (
                    <div className="space-y-2">
                      <Button
                        disabled={true}
                        className="w-full bg-gradient-to-r from-gray-600 to-gray-700 hover:opacity-75 flex items-center justify-center gap-2 opacity-50 cursor-not-allowed"
                      >
                        <X className="w-4 h-4" />
                        Nicht verfügbar - kostenlos
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-12 text-center space-y-4">
          <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-xl max-w-2xl mx-auto">
            <h3 className="text-xl font-semibold text-white mb-2 flex items-center justify-center gap-2">
              <Mail className="w-5 h-5 text-cyan-400" />
              Fragen zu Premium?
            </h3>
            <p className="text-gray-400 mb-4">
              Kontaktiere uns per E-Mail bei Fragen zu den Premium-Plänen oder zum Google Play Kauf.
            </p>
            <Button
              onClick={() => {
                window.location.href = `mailto:support@catchgbt.app?subject=Premium Anfrage&body=Hallo,%0D%0A%0D%0AIch interessiere mich für einen Premium-Plan.%0D%0A%0D%0AMeine E-Mail: ${user?.email || ''}`;
              }}
              variant="outline"
              className="border-cyan-500 text-cyan-400 hover:bg-cyan-500/10"
            >
              <Mail className="w-4 h-4 mr-2" />
              Support kontaktieren
            </Button>
          </div>

          <p className="text-gray-500 text-sm">
            {billingAvailable
              ? 'Alle Kaeufe erfolgen ueber deinen Google Play Account. Verwaltung & Kuendigung in den Play Store Einstellungen.'
              : 'Bezahlung per Kreditkarte, Google Pay oder Apple Pay laeuft sicher ueber Stripe.'}
          </p>
        </div>
      </div>
    </div>
  );
}