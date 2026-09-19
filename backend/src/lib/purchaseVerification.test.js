import { describe, it, expect, vi, beforeEach } from 'vitest';

const { googleAuthMock, androidPublisherMock, stripeInstanceMock } = vi.hoisted(() => ({
  googleAuthMock: vi.fn(),
  androidPublisherMock: {
    purchases: {
      products: { get: vi.fn() },
      subscriptions: { get: vi.fn() },
    },
  },
  stripeInstanceMock: {
    checkout: { sessions: { retrieve: vi.fn(), create: vi.fn() } },
  },
}));

vi.mock('googleapis', () => ({
  google: {
    // Ebenfalls ein Konstruktor (`new google.auth.GoogleAuth(...)`).
    auth: { GoogleAuth: class GoogleAuthMock {
      constructor(...args) { googleAuthMock(...args); }
    } },
    androidpublisher: vi.fn(() => androidPublisherMock),
  },
}));

vi.mock('stripe', () => ({
  // Konstruktor-Mock als class: eine Pfeilfunktion hat kein [[Construct]],
  // `new Stripe(key)` in purchaseVerification.js wirft damit
  // "is not a constructor".
  default: class StripeMock {
    constructor() {
      return stripeInstanceMock;
    }
  },
}));

let verifyGooglePlayPurchase;

beforeEach(async () => {
  vi.resetModules();
  androidPublisherMock.purchases.products.get.mockReset();
  androidPublisherMock.purchases.subscriptions.get.mockReset();
  stripeInstanceMock.checkout.sessions.retrieve.mockReset();
  stripeInstanceMock.checkout.sessions.create.mockReset();
  ({ verifyGooglePlayPurchase } = await import('./purchaseVerification.js'));
});

describe('verifyGooglePlayPurchase', () => {
  const SUB_PRODUCT = 'baitbuddy_ultimate_monthly';
  const TRIAL_PRODUCT = 'baitbuddy_trial_10_10';
  const FUTURE = String(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const PAST = String(Date.now() - 1000);

  it('liefert valid:false, wenn keine Service-Account-Credentials konfiguriert sind', async () => {
    delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
    const result = await verifyGooglePlayPurchase({ productId: SUB_PRODUCT, purchaseToken: 'tok' });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/nicht konfiguriert/);
  });

  it('akzeptiert ein aktives, bezahltes Abo (paymentState=1, Ablauf in der Zukunft)', async () => {
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{"type":"service_account"}';
    androidPublisherMock.purchases.subscriptions.get.mockResolvedValue({
      data: { paymentState: 1, expiryTimeMillis: FUTURE },
    });

    const result = await verifyGooglePlayPurchase({ productId: SUB_PRODUCT, purchaseToken: 'tok' });

    expect(result.valid).toBe(true);
    expect(androidPublisherMock.purchases.subscriptions.get).toHaveBeenCalledWith({
      packageName: 'app.baitbuddy.mobile',
      subscriptionId: SUB_PRODUCT,
      token: 'tok',
    });
  });

  it('akzeptiert ein Abo im Testzeitraum (paymentState=2)', async () => {
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{"type":"service_account"}';
    androidPublisherMock.purchases.subscriptions.get.mockResolvedValue({
      data: { paymentState: 2, expiryTimeMillis: FUTURE },
    });

    const result = await verifyGooglePlayPurchase({ productId: SUB_PRODUCT, purchaseToken: 'tok' });
    expect(result.valid).toBe(true);
  });

  it('lehnt ein abgelaufenes Abo ab', async () => {
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{"type":"service_account"}';
    androidPublisherMock.purchases.subscriptions.get.mockResolvedValue({
      data: { paymentState: 1, expiryTimeMillis: PAST },
    });

    const result = await verifyGooglePlayPurchase({ productId: SUB_PRODUCT, purchaseToken: 'tok' });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/abgelaufen/);
  });

  it('lehnt ein Abo ohne aktive Zahlung ab (paymentState=0)', async () => {
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{"type":"service_account"}';
    androidPublisherMock.purchases.subscriptions.get.mockResolvedValue({
      data: { paymentState: 0, expiryTimeMillis: FUTURE },
    });

    const result = await verifyGooglePlayPurchase({ productId: SUB_PRODUCT, purchaseToken: 'tok' });
    expect(result.valid).toBe(false);
  });

  it('faengt API-Fehler ab, statt zu werfen', async () => {
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{"type":"service_account"}';
    androidPublisherMock.purchases.subscriptions.get.mockRejectedValue(new Error('invalid token'));

    const result = await verifyGooglePlayPurchase({ productId: SUB_PRODUCT, purchaseToken: 'tok' });
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/invalid token/);
  });

  it('verifiziert das Trial-Einmalprodukt über die products-API (purchaseState=0)', async () => {
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{"type":"service_account"}';
    androidPublisherMock.purchases.products.get.mockResolvedValue({
      data: { purchaseState: 0, consumptionState: 0 },
    });

    const result = await verifyGooglePlayPurchase({ productId: TRIAL_PRODUCT, purchaseToken: 'tok' });

    expect(result.valid).toBe(true);
    expect(androidPublisherMock.purchases.products.get).toHaveBeenCalledWith({
      packageName: 'app.baitbuddy.mobile',
      productId: TRIAL_PRODUCT,
      token: 'tok',
    });
    expect(androidPublisherMock.purchases.subscriptions.get).not.toHaveBeenCalled();
  });

  it('lehnt ein bereits konsumiertes Trial-Produkt ab', async () => {
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{"type":"service_account"}';
    androidPublisherMock.purchases.products.get.mockResolvedValue({
      data: { purchaseState: 0, consumptionState: 1 },
    });

    const result = await verifyGooglePlayPurchase({ productId: TRIAL_PRODUCT, purchaseToken: 'tok' });
    expect(result.valid).toBe(false);
  });
});
