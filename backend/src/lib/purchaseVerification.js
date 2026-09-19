import { google } from 'googleapis';
import Stripe from 'stripe';

// ACHTUNG — UNGETESTET GEGEN ECHTE APIS: Dieses Modul wurde nach offizieller
// Google-Play- und Stripe-API-Dokumentation implementiert, aber in dieser
// Umgebung stehen keine echten Service-Account-/Secret-Credentials zur
// Verfügung. Es gibt daher keine Möglichkeit, den Code gegen die echten APIs
// zu verifizieren (nur Unit-Tests mit gemockten SDK-Aufrufen, siehe
// purchaseVerification.test.js). Vor dem ersten Produktiv-Einsatz MUSS ein
// echter Testkauf (Google Play Test-Track bzw. Stripe Test-Mode) den
// kompletten Ablauf einmal real durchlaufen.

const ANDROID_PACKAGE_NAME = 'app.baitbuddy.mobile';

let androidPublisherClient = null;
function getAndroidPublisherClient() {
  if (androidPublisherClient) return androidPublisherClient;
  const credsJson = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!credsJson) return null;
  const credentials = JSON.parse(credsJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  androidPublisherClient = google.androidpublisher({ version: 'v3', auth });
  return androidPublisherClient;
}

// Einmal-Produkte (kein Abo). Alle Premium-Pläne sind Google-Play-Abos (SUBS);
// nur das Trial-Produkt ist ein einmaliges In-App-Produkt (INAPP) und wird
// deshalb über die products-API statt der subscriptions-API verifiziert.
const ONE_TIME_PRODUCT_IDS = new Set(['baitbuddy_trial_10_10']);

// Verifiziert einen Google-Play-Kauf. Abos gehen über die subscriptions-API,
// das Trial-Einmalprodukt über die products-API. BaitBuddy berechnet die
// Laufzeit anschließend selbst (siehe premium.js).
export async function verifyGooglePlayPurchase({ productId, purchaseToken }) {
  const client = getAndroidPublisherClient();
  if (!client) return { valid: false, reason: 'Google Play Verifikation nicht konfiguriert' };
  if (!productId || !purchaseToken) return { valid: false, reason: 'productId und purchaseToken erforderlich' };

  return ONE_TIME_PRODUCT_IDS.has(productId)
    ? verifyGooglePlayOneTimeProduct(client, productId, purchaseToken)
    : verifyGooglePlaySubscription(client, productId, purchaseToken);
}

// Abo-Verifikation. paymentState 1 = bezahlt, 2 = Testzeitraum; zusätzlich muss
// das Ablaufdatum in der Zukunft liegen.
// https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptions/get
async function verifyGooglePlaySubscription(client, productId, purchaseToken) {
  try {
    const { data } = await client.purchases.subscriptions.get({
      packageName: ANDROID_PACKAGE_NAME,
      subscriptionId: productId,
      token: purchaseToken,
    });
    if (data.paymentState !== 1 && data.paymentState !== 2) {
      return { valid: false, reason: `Abo nicht aktiv (paymentState=${data.paymentState})` };
    }
    const expiryMs = Number(data.expiryTimeMillis);
    if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) {
      return { valid: false, reason: 'Abo abgelaufen' };
    }
    return { valid: true, raw: data };
  } catch (e) {
    return { valid: false, reason: `Google Play API Fehler: ${e.message}` };
  }
}

// Einmal-Produkt-Verifikation (Trial). purchaseState 0 = gekauft.
// https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products/get
async function verifyGooglePlayOneTimeProduct(client, productId, purchaseToken) {
  try {
    const { data } = await client.purchases.products.get({
      packageName: ANDROID_PACKAGE_NAME,
      productId,
      token: purchaseToken,
    });
    if (data.purchaseState !== 0) {
      return { valid: false, reason: `Kauf nicht abgeschlossen (purchaseState=${data.purchaseState})` };
    }
    if (data.consumptionState === 1) {
      return { valid: false, reason: 'Kauf wurde bereits konsumiert' };
    }
    return { valid: true, raw: data };
  } catch (e) {
    return { valid: false, reason: `Google Play API Fehler: ${e.message}` };
  }
}

let stripeClient = null;
export function getStripeClient() {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  stripeClient = new Stripe(key);
  return stripeClient;
}

// Verifies Stripe's signature over the original, unmodified request bytes.
// This must be called only from a route mounted before express.json().
export function constructStripeWebhookEvent(rawBody, signature) {
  const client = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!client || !webhookSecret) throw new Error('Stripe webhook is not configured');
  if (!signature) throw new Error('Missing Stripe-Signature');
  return client.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
