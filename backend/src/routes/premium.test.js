import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createSupabaseMock } from '../../test/mockSupabase.js';

const TEST_USER = { id: 'user-1', email: 'angler@baitbuddy.test', user_metadata: {}, app_metadata: {} };

const { supabaseMock, purchaseVerificationMock } = vi.hoisted(() => ({
  supabaseMock: { current: null },
  purchaseVerificationMock: {
    verifyGooglePlayPurchase: vi.fn(),
    verifyStripePayment: vi.fn(),
    createStripeCheckoutSession: vi.fn(),
    constructStripeWebhookEvent: vi.fn(),
  },
}));
vi.mock('../lib/supabase.js', () => ({
  get supabase() { return supabaseMock.current; },
}));
vi.mock('../lib/purchaseVerification.js', () => purchaseVerificationMock);

let app;

beforeEach(async () => {
  vi.resetModules();
  delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  delete process.env.STRIPE_SECRET_KEY;
  purchaseVerificationMock.verifyGooglePlayPurchase.mockReset();
  purchaseVerificationMock.verifyStripePayment.mockReset();
  purchaseVerificationMock.createStripeCheckoutSession.mockReset();
  supabaseMock.current = createSupabaseMock({ authUser: TEST_USER });
  ({ default: app } = await import('../server.js'));
});

describe('POST /api/premium/activate', () => {
  it('lehnt Aktivierung ohne purchase_token/transaction_id ab (400)', async () => {
    const res = await request(app)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'elite' });

    expect(res.status).toBe(400);
  });

  it('lehnt Google-Play-Aktivierung ohne konfigurierte Play-Verifikation ab (501)', async () => {
    const res = await request(app)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'elite', purchase_token: 'irgendein-token' });

    expect(res.status).toBe(501);
  });

  it('lehnt Stripe/Sonstige-Aktivierung ohne konfigurierte Verifikation ab (501)', async () => {
    const res = await request(app)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'elite', transaction_id: 'irgendeine-id' });

    expect(res.status).toBe(501);
  });

  it('aktiviert den Plan, wenn Play-Verifikation konfiguriert ist und der Kauf gueltig ist', async () => {
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{"type":"service_account"}';
    purchaseVerificationMock.verifyGooglePlayPurchase.mockResolvedValue({ valid: true });
    vi.resetModules();
    ({ default: app } = await import('../server.js'));

    supabaseMock.current.auth.admin = {
      updateUserById: vi.fn(async () => ({ data: {}, error: null })),
    };

    const res = await request(app)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'elite', purchase_token: 'echter-play-token', product_id: 'baitbuddy_ultimate_monthly' });

    expect(res.status).toBe(200);
    expect(res.body.plan_id).toBe('elite');
    expect(supabaseMock.current.auth.admin.updateUserById).toHaveBeenCalled();
  });

  it('lehnt Aktivierung ab, wenn die Play-Verifikation den Kauf als ungueltig meldet', async () => {
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{"type":"service_account"}';
    purchaseVerificationMock.verifyGooglePlayPurchase.mockResolvedValue({ valid: false, reason: 'purchaseState=1' });
    vi.resetModules();
    ({ default: app } = await import('../server.js'));

    const res = await request(app)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'elite', purchase_token: 'gefaelschter-token', product_id: 'baitbuddy_ultimate_monthly' });

    expect(res.status).toBe(402);
  });
});

describe('POST /api/premium/activate (Google-Play-Laufzeit)', () => {
  async function playApp(appMetadata = {}) {
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{"type":"service_account"}';
    supabaseMock.current = createSupabaseMock({
      authUser: { ...TEST_USER, app_metadata: appMetadata },
    });
    supabaseMock.current.auth.admin = {
      updateUserById: vi.fn(async () => ({ data: {}, error: null })),
    };
    vi.resetModules();
    return (await import('../server.js')).default;
  }

  const daysFromNow = (days) => Date.now() + days * 24 * 3600 * 1000;

  it('lehnt ein bezahltes Produkt für einen anderen Plan ab', async () => {
    const configuredApp = await playApp();
    const res = await request(configuredApp)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'elite', purchase_token: 'basic-token', product_id: 'baitbuddy_basic_monthly' });
    expect(res.status).toBe(400);
    expect(purchaseVerificationMock.verifyGooglePlayPurchase).not.toHaveBeenCalled();
    expect(supabaseMock.current.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('uebernimmt das von Play gemeldete Ablaufdatum statt pauschal 30 Tage', async () => {
    const playExpiry = daysFromNow(45);
    const configuredApp = await playApp();
    purchaseVerificationMock.verifyGooglePlayPurchase.mockResolvedValue({
      valid: true,
      raw: { expiryTimeMillis: String(playExpiry) },
    });

    const res = await request(configuredApp)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'elite', purchase_token: 'play-token', product_id: 'baitbuddy_ultimate_monthly' });

    expect(res.status).toBe(200);
    expect(res.body.expires_at).toBe(new Date(playExpiry).toISOString());
  });

  it('verlaengert das Abo, wenn Play denselben Token mit spaeterem Ablauf meldet', async () => {
    const renewedExpiry = daysFromNow(30);
    const configuredApp = await playApp({
      premium_plan_id: 'elite',
      premium_expires_at: new Date(daysFromNow(1)).toISOString(),
      premium_purchase_token: 'play-token',
    });
    purchaseVerificationMock.verifyGooglePlayPurchase.mockResolvedValue({
      valid: true,
      raw: { expiryTimeMillis: String(renewedExpiry) },
    });

    const res = await request(configuredApp)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'elite', purchase_token: 'play-token', product_id: 'baitbuddy_ultimate_monthly' });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(true);
    expect(res.body.expires_at).toBe(new Date(renewedExpiry).toISOString());
    expect(supabaseMock.current.auth.admin.updateUserById).toHaveBeenCalled();
  });

  it('schreibt nichts fort, wenn Play kein spaeteres Ablaufdatum meldet', async () => {
    const expiryMs = daysFromNow(20);
    const storedExpiry = new Date(expiryMs).toISOString();
    const configuredApp = await playApp({
      premium_plan_id: 'elite',
      premium_expires_at: storedExpiry,
      premium_purchase_token: 'play-token',
    });
    // Unveraendertes Ablaufdatum: Play hat nicht verlaengert.
    purchaseVerificationMock.verifyGooglePlayPurchase.mockResolvedValue({
      valid: true,
      raw: { expiryTimeMillis: String(expiryMs) },
    });

    const res = await request(configuredApp)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'elite', purchase_token: 'play-token', product_id: 'baitbuddy_ultimate_monthly' });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(false);
    expect(res.body.expires_at).toBe(storedExpiry);
    expect(supabaseMock.current.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('gibt dem 10-Tage-Einmalprodukt 10 Tage Laufzeit auf Ultimate-Niveau', async () => {
    const configuredApp = await playApp();
    // Einmalprodukte liefern kein expiryTimeMillis — der Server rechnet selbst.
    purchaseVerificationMock.verifyGooglePlayPurchase.mockResolvedValue({
      valid: true,
      raw: { purchaseState: 0 },
    });

    const res = await request(configuredApp)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'trial_10_10', purchase_token: 'play-token', product_id: 'baitbuddy_trial_10_10' });

    expect(res.status).toBe(200);
    const days = (new Date(res.body.expires_at).getTime() - Date.now()) / (24 * 3600 * 1000);
    expect(days).toBeGreaterThan(9.9);
    expect(days).toBeLessThan(10.1);
  });

  it('behandelt trial_10_10 als Ultimate-Plan beim Feature-Check', async () => {
    const configuredApp = await playApp({
      premium_plan_id: 'trial_10_10',
      premium_expires_at: new Date(daysFromNow(5)).toISOString(),
    });

    const res = await request(configuredApp)
      .post('/api/premium/check-feature')
      .set('Authorization', 'Bearer test-token')
      .send({ feature: 'offline' });

    expect(res.body.allowed).toBe(true);
  });
});

describe('GET /api/premium/config', () => {
  it('meldet nicht konfigurierte Zahlungswege, damit die UI vorher sperren kann', async () => {
    const res = await request(app).get('/api/premium/config');

    expect(res.status).toBe(200);
    expect(res.body.payment_methods).toEqual({ google_play: false, stripe: false });
  });

  it('meldet konfigurierte Zahlungswege', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{"type":"service_account"}';
    vi.resetModules();
    const configuredApp = (await import('../server.js')).default;

    const res = await request(configuredApp).get('/api/premium/config');

    expect(res.body.payment_methods).toEqual({ google_play: true, stripe: true });
  });
});

describe('POST /api/premium/checkout', () => {
  async function stripeApp() {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    vi.resetModules();
    return (await import('../server.js')).default;
  }

  it('lehnt Checkout ohne konfiguriertes Stripe-Secret ab (501)', async () => {
    const res = await request(app)
      .post('/api/premium/checkout')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'pro' });

    expect(res.status).toBe(501);
  });

  it('lehnt eine unbekannte plan_id ab (400)', async () => {
    const configuredApp = await stripeApp();
    const res = await request(configuredApp)
      .post('/api/premium/checkout')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'mega_deluxe' });

    expect(res.status).toBe(400);
    expect(purchaseVerificationMock.createStripeCheckoutSession).not.toHaveBeenCalled();
  });

  it('erstellt eine Checkout-Session mit serverseitigem Preis und liefert die URL', async () => {
    const configuredApp = await stripeApp();
    purchaseVerificationMock.createStripeCheckoutSession.mockResolvedValue({
      ok: true, id: 'cs_test_1', url: 'https://checkout.stripe.com/pay/cs_test_1',
    });

    const res = await request(configuredApp)
      .post('/api/premium/checkout')
      .set('Authorization', 'Bearer test-token')
      .set('Origin', 'https://baitbuddy.test')
      .send({ plan_id: 'pro' });

    expect(res.status).toBe(200);
    expect(res.body.checkout_url).toBe('https://checkout.stripe.com/pay/cs_test_1');
    expect(purchaseVerificationMock.createStripeCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 'pro',
        amountCents: 1800,
        userId: 'user-1',
        successUrl: expect.stringContaining('https://baitbuddy.test/PremiumPlans?checkout=success&plan_id=pro'),
        cancelUrl: 'https://baitbuddy.test/PremiumPlans?checkout=cancelled',
      })
    );
  });

  it('liefert 502, wenn Stripe die Session nicht erstellen kann', async () => {
    const configuredApp = await stripeApp();
    purchaseVerificationMock.createStripeCheckoutSession.mockResolvedValue({
      ok: false, reason: 'Stripe API Fehler: key invalid',
    });

    const res = await request(configuredApp)
      .post('/api/premium/checkout')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'basic' });

    expect(res.status).toBe(502);
  });
});

describe('POST /api/premium/activate (Stripe-Härtung)', () => {
  async function stripeApp(appMetadata = {}) {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    supabaseMock.current = createSupabaseMock({
      authUser: { ...TEST_USER, app_metadata: appMetadata },
    });
    supabaseMock.current.auth.admin = {
      updateUserById: vi.fn(async () => ({ data: {}, error: null })),
    };
    vi.resetModules();
    return (await import('../server.js')).default;
  }

  it('lehnt eine bezahlte Session ohne BaitBuddy-Konto und Planbindung ab', async () => {
    const configuredApp = await stripeApp();
    purchaseVerificationMock.verifyStripePayment.mockResolvedValue({ valid: true, raw: {} });
    const res = await request(configuredApp)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'elite', transaction_id: 'cs_test_1' });
    expect(res.status).toBe(403);
    expect(supabaseMock.current.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('aktiviert einen Plan mit passender, bezahlter Stripe-Session', async () => {
    const configuredApp = await stripeApp();
    purchaseVerificationMock.verifyStripePayment.mockResolvedValue({
      valid: true,
      raw: { client_reference_id: 'user-1', metadata: { plan_id: 'pro' } },
    });

    const res = await request(configuredApp)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'pro', transaction_id: 'cs_test_1', payment_method: 'stripe' });

    expect(res.status).toBe(200);
    expect(res.body.plan_id).toBe('pro');
    expect(supabaseMock.current.auth.admin.updateUserById).toHaveBeenCalled();
  });

  it('lehnt eine Session ab, die zu einem anderen Konto gehört (403)', async () => {
    const configuredApp = await stripeApp();
    purchaseVerificationMock.verifyStripePayment.mockResolvedValue({
      valid: true,
      raw: { client_reference_id: 'anderer-user', metadata: { plan_id: 'pro' } },
    });

    const res = await request(configuredApp)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'pro', transaction_id: 'cs_test_1' });

    expect(res.status).toBe(403);
    expect(supabaseMock.current.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('lehnt eine Session ab, die für einen anderen Plan bezahlt wurde (400)', async () => {
    const configuredApp = await stripeApp();
    purchaseVerificationMock.verifyStripePayment.mockResolvedValue({
      valid: true,
      raw: { client_reference_id: 'user-1', metadata: { plan_id: 'basic' } },
    });

    const res = await request(configuredApp)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'elite', transaction_id: 'cs_test_1' });

    expect(res.status).toBe(400);
    expect(supabaseMock.current.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('verlängert die Laufzeit bei bereits verarbeiteter Transaktion NICHT (Replay)', async () => {
    const expiresAt = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();
    const configuredApp = await stripeApp({
      premium_plan_id: 'pro',
      premium_expires_at: expiresAt,
      premium_transaction_id: 'cs_test_1',
    });
    purchaseVerificationMock.verifyStripePayment.mockResolvedValue({
      valid: true,
      raw: { client_reference_id: 'user-1', metadata: { plan_id: 'pro' } },
    });

    const res = await request(configuredApp)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'pro', transaction_id: 'cs_test_1' });

    expect(res.status).toBe(200);
    expect(res.body.expires_at).toBe(expiresAt);
    expect(supabaseMock.current.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
});

describe('POST /api/premium/activate – Replay-Schutz über alle Transaktionen', () => {
  async function stripeUserApp(appMetadata) {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    supabaseMock.current = createSupabaseMock({
      authUser: { ...TEST_USER, app_metadata: appMetadata },
      adminUsers: [{ ...TEST_USER, app_metadata: appMetadata }],
    });
    vi.resetModules();
    return (await import('../server.js')).default;
  }

  it('schreibt einen bereits verbuchten 24h-Pass nicht erneut gut', async () => {
    const passEnd = new Date(Date.now() + 20 * 3600 * 1000).toISOString();
    const configuredApp = await stripeUserApp({
      premium_plan_id: 'free',
      premium_pass_expires_at: passEnd,
      premium_transaction_id: 'cs_pass',
    });
    purchaseVerificationMock.verifyStripePayment.mockResolvedValue({
      valid: true,
      raw: { client_reference_id: 'user-1', metadata: { plan_id: 'premium_24h' } },
    });

    const res = await request(configuredApp)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'premium_24h', transaction_id: 'cs_pass' });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(false);
    expect(supabaseMock.current.__adminUsers[0].app_metadata.premium_pass_expires_at).toBe(passEnd);
  });

  it('ignoriert eine ältere, bereits verbuchte Session nach einem neueren Kauf', async () => {
    const expiresAt = new Date(Date.now() + 25 * 24 * 3600 * 1000).toISOString();
    const configuredApp = await stripeUserApp({
      premium_plan_id: 'elite',
      premium_expires_at: expiresAt,
      premium_transaction_id: 'cs_new',
      premium_processed_transactions: ['cs_old', 'cs_new'],
    });
    purchaseVerificationMock.verifyStripePayment.mockResolvedValue({
      valid: true,
      raw: { client_reference_id: 'user-1', metadata: { plan_id: 'elite' } },
    });

    const res = await request(configuredApp)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'elite', transaction_id: 'cs_old' });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(false);
    expect(supabaseMock.current.__adminUsers[0].app_metadata.premium_expires_at).toBe(expiresAt);
  });

  it('merkt sich neue Transaktionen für spätere Prüfungen', async () => {
    const configuredApp = await stripeUserApp({ premium_processed_transactions: ['cs_a'] });
    purchaseVerificationMock.verifyStripePayment.mockResolvedValue({
      valid: true,
      raw: { client_reference_id: 'user-1', metadata: { plan_id: 'pro' } },
    });

    const res = await request(configuredApp)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'pro', transaction_id: 'cs_b' });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(true);
    expect(supabaseMock.current.__adminUsers[0].app_metadata.premium_processed_transactions).toEqual(['cs_a', 'cs_b']);
  });

  it('verbucht zwei verschiedene Käufe desselben Plans auch kurz nacheinander', async () => {
    const configuredApp = await stripeUserApp({
      premium_plan_id: 'pro',
      premium_expires_at: new Date(Date.now() + 20 * 86400000).toISOString(),
      premium_transaction_id: 'cs_first',
      premium_activated_at: new Date().toISOString(),
    });
    purchaseVerificationMock.verifyStripePayment.mockResolvedValue({
      valid: true,
      raw: { client_reference_id: 'user-1', metadata: { plan_id: 'pro' } },
    });
    const res = await request(configuredApp)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'pro', transaction_id: 'cs_second' });
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(true);
    expect(supabaseMock.current.__adminUsers[0].app_metadata.premium_transaction_id).toBe('cs_second');
  });
});

describe('Referral: 10-EUR-Ultimate-Rabatt', () => {
  it('zieht den Referral-Rabatt beim Ultimate-Checkout ab (elite)', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    supabaseMock.current = createSupabaseMock({
      authUser: { ...TEST_USER, app_metadata: { ultimate_discount_cents: 1000 } },
    });
    vi.resetModules();
    const configuredApp = (await import('../server.js')).default;
    purchaseVerificationMock.createStripeCheckoutSession.mockResolvedValue({
      ok: true, id: 'cs_test_2', url: 'https://checkout.stripe.com/pay/cs_test_2',
    });

    const res = await request(configuredApp)
      .post('/api/premium/checkout')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'elite' });

    expect(res.status).toBe(200);
    // Ultimate 3600 - 1000 Rabatt = 2600
    expect(purchaseVerificationMock.createStripeCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'elite', amountCents: 2600 })
    );
  });

  it('begrenzt den rabattierten Ultimate-Preis auf den Mindestbetrag (999)', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    supabaseMock.current = createSupabaseMock({
      authUser: { ...TEST_USER, app_metadata: { ultimate_discount_cents: 3000 } },
    });
    vi.resetModules();
    const configuredApp = (await import('../server.js')).default;
    purchaseVerificationMock.createStripeCheckoutSession.mockResolvedValue({
      ok: true, id: 'cs_test_3', url: 'https://checkout.stripe.com/pay/cs_test_3',
    });

    const res = await request(configuredApp)
      .post('/api/premium/checkout')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'elite' });

    expect(res.status).toBe(200);
    // 3600 - 3000 = 600 -> auf Mindestbetrag 999 begrenzt
    expect(purchaseVerificationMock.createStripeCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'elite', amountCents: 999 })
    );
  });

  it('schreibt dem Referrer 10 EUR gut, wenn ein eingeladener Freund Basic aktiviert', async () => {
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = '{"type":"service_account"}';
    purchaseVerificationMock.verifyGooglePlayPurchase.mockResolvedValue({ valid: true });
    supabaseMock.current = createSupabaseMock({
      authUser: { ...TEST_USER, user_metadata: { referred_by: 'ABC12345' } },
      fromResults: {
        referrals: { data: { id: 'ref-1', referrer_user_id: 'user-2', basic_reward_granted: false }, error: null },
      },
    });
    supabaseMock.current.auth.admin = {
      updateUserById: vi.fn(async () => ({ data: {}, error: null })),
      getUserById: vi.fn(async (id) => ({
        data: {
          user: id === 'user-2'
            ? { id: 'user-2', user_metadata: {}, app_metadata: {} }
            : { ...TEST_USER, user_metadata: { referred_by: 'ABC12345' } },
        },
        error: null,
      })),
    };
    vi.resetModules();
    const configuredApp = (await import('../server.js')).default;

    const res = await request(configuredApp)
      .post('/api/premium/activate')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: 'basic', purchase_token: 'echter-play-token', product_id: 'baitbuddy_basic_monthly' });

    expect(res.status).toBe(200);
    expect(res.body.plan_id).toBe('basic');
    expect(supabaseMock.current.auth.admin.getUserById).toHaveBeenCalledWith('user-2');
    // Referrer (user-2) bekommt 1000 Cent Rabatt gutgeschrieben.
    expect(supabaseMock.current.auth.admin.updateUserById).toHaveBeenCalledWith(
      'user-2',
      expect.objectContaining({
        app_metadata: expect.objectContaining({ ultimate_discount_cents: 1000 }),
      })
    );
    // Einladung als belohnt markiert (Idempotenz).
    expect(supabaseMock.current.__builders.referrals.update).toHaveBeenCalledWith({ basic_reward_granted: true });
  });
});

describe('POST /api/premium/check-feature', () => {
  async function appWithPlan(planId) {
    const futureDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const user = {
      id: 'user-1',
      email: 'angler@baitbuddy.test',
      user_metadata: {},
      app_metadata: planId === 'free' ? {} : { premium_plan_id: planId, premium_expires_at: futureDate },
    };
    supabaseMock.current = createSupabaseMock({ authUser: user });
    vi.resetModules();
    return (await import('../server.js')).default;
  }

  it('erlaubt ein Basic-Feature fuer einen Free-Nutzer NICHT', async () => {
    const freeApp = await appWithPlan('free');
    const res = await request(freeApp)
      .post('/api/premium/check-feature')
      .set('Authorization', 'Bearer test-token')
      .send({ feature: 'fangbuch' });

    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(false);
  });

  it('erlaubt ein Basic-Feature fuer einen Basic-Nutzer', async () => {
    const basicApp = await appWithPlan('basic');
    const res = await request(basicApp)
      .post('/api/premium/check-feature')
      .set('Authorization', 'Bearer test-token')
      .send({ feature: 'fangbuch' });

    expect(res.body.allowed).toBe(true);
  });

  it('erlaubt ein Elite-Feature fuer einen Basic-Nutzer NICHT', async () => {
    const basicApp = await appWithPlan('basic');
    const res = await request(basicApp)
      .post('/api/premium/check-feature')
      .set('Authorization', 'Bearer test-token')
      .send({ feature: 'offline' });

    expect(res.body.allowed).toBe(false);
    expect(res.body.required_plan).toBe('elite');
  });

  it('sperrt unbekannte Feature-Keys standardmaessig (fail-closed)', async () => {
    const freeApp = await appWithPlan('free');
    const res = await request(freeApp)
      .post('/api/premium/check-feature')
      .set('Authorization', 'Bearer test-token')
      .send({ feature: 'ein_zukuenftiges_feature' });

    expect(res.body.allowed).toBe(false);
    expect(res.body.required_plan).toBe(null);
  });
});

describe('GET /api/premium/status', () => {
  it('liefert free ohne user_metadata', async () => {
    const res = await request(app)
      .get('/api/premium/status')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.plan.id).toBe('free');
  });
});

// Der Mindestpreis von 9,99 € galt früher für JEDEN Plan statt nur als
// Rabatt-Untergrenze: Basic (8,99 €) und der 24h-Pass (4,99 €) wurden mit
// 9,99 € abgerechnet.
describe('POST /api/premium/checkout – Preise ohne Rabatt', () => {
  it.each([
    ['basic', 899],
    ['premium_24h', 499],
    ['pro', 1800],
    ['elite', 3600],
  ])('berechnet %s mit dem Listenpreis (%i Cent)', async (planId, cents) => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    vi.resetModules();
    const configuredApp = (await import('../server.js')).default;
    purchaseVerificationMock.createStripeCheckoutSession.mockResolvedValue({
      ok: true, id: 'cs_x', url: 'https://checkout.stripe.com/pay/cs_x',
    });

    const res = await request(configuredApp)
      .post('/api/premium/checkout')
      .set('Authorization', 'Bearer test-token')
      .send({ plan_id: planId });

    expect(res.status).toBe(200);
    expect(purchaseVerificationMock.createStripeCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ planId, amountCents: cents })
    );
  });
});

describe('POST /api/premium/stripe/webhook', () => {
  const paidSession = (planId) => ({
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_${planId}`,
        payment_status: 'paid',
        client_reference_id: 'user-1',
        metadata: { plan_id: planId },
      },
    },
  });

  it('verbraucht den Referral-Rabatt bei einem Ultimate-Kauf', async () => {
    supabaseMock.current = createSupabaseMock({
      adminUsers: [{ ...TEST_USER, app_metadata: { ultimate_discount_cents: 2000, premium_trial: true } }],
    });
    purchaseVerificationMock.constructStripeWebhookEvent.mockReturnValue(paidSession('elite'));
    vi.resetModules();
    const configuredApp = (await import('../server.js')).default;

    const res = await request(configuredApp)
      .post('/api/premium/stripe/webhook')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(200);
    expect(res.body.fulfilled).toBe(true);
    const stored = supabaseMock.current.__adminUsers[0].app_metadata;
    expect(stored.premium_plan_id).toBe('elite');
    expect(stored.ultimate_discount_cents).toBe(0);
    expect(stored.premium_trial).toBe(false);
  });

  it('verlängert einen laufenden Pass beim 24h-Kauf statt ihn zu überschreiben', async () => {
    const passEnd = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    supabaseMock.current = createSupabaseMock({
      adminUsers: [{ ...TEST_USER, app_metadata: { premium_pass_expires_at: passEnd } }],
    });
    purchaseVerificationMock.constructStripeWebhookEvent.mockReturnValue(paidSession('premium_24h'));
    vi.resetModules();
    const configuredApp = (await import('../server.js')).default;

    const res = await request(configuredApp)
      .post('/api/premium/stripe/webhook')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(res.status).toBe(200);
    const stored = supabaseMock.current.__adminUsers[0].app_metadata;
    expect(new Date(stored.premium_pass_expires_at).getTime())
      .toBe(new Date(passEnd).getTime() + 24 * 60 * 60 * 1000);
  });
});
