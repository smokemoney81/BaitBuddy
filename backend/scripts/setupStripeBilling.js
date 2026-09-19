// Run with a test-mode key first. Prints identifiers only; never prints keys.
import 'dotenv/config';
import Stripe from 'stripe';
import { BILLING_PLANS } from '../../shared/billingCatalog.js';
if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY fehlt');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const products = [];
for (const [id, plan] of Object.entries(BILLING_PLANS)) {
  if (!plan.interval || plan.legacy) continue;
  const product = await stripe.products.create({ name: `BaitBuddy ${plan.name}`, metadata: { plan_id: id } }, { idempotencyKey: `baitbuddy-product-v1-${id}` });
  const price = await stripe.prices.create({ product: product.id, currency: 'eur', unit_amount: plan.amountCents, recurring: { interval: plan.interval }, lookup_key: `baitbuddy_${id}_eur_${plan.interval}`, metadata: { plan_id: id } }, { idempotencyKey: `baitbuddy-price-v1-${id}-${plan.amountCents}` });
  products.push({ product: product.id, prices: [price.id] });
  console.log(`${plan.priceEnv}=${price.id}`);
}
// Separate products are required for tier switching in the customer portal.
const portal = await stripe.billingPortal.configurations.create({
  business_profile: { headline: 'BaitBuddy Abo verwalten' },
  features: {
    customer_update: { enabled: true, allowed_updates: ['email','address'] },
    invoice_history: { enabled: true }, payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end' },
    subscription_update: { enabled: true, default_allowed_updates: ['price'], proration_behavior: 'always_invoice', products, schedule_at_period_end: { conditions: [{ type: 'decreasing_item_amount' }] } },
  },
}, { idempotencyKey: 'baitbuddy-portal-v1' });
console.log(`STRIPE_PORTAL_CONFIGURATION=${portal.id}`);
