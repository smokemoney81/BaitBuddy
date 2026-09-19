import { describe, it, expect, vi, beforeEach } from 'vitest';
const { stripe, applyPayment } = vi.hoisted(() => ({
  stripe: {
    customers: { create: vi.fn() }, subscriptions: { list: vi.fn(), retrieve: vi.fn() },
    checkout: { sessions: { list: vi.fn(), create: vi.fn(), retrieve: vi.fn() } },
    coupons: { create: vi.fn() }, billingPortal: { sessions: { create: vi.fn() } },
  }, applyPayment: vi.fn(),
}));
vi.mock('./purchaseVerification.js', () => ({ getStripeClient: () => stripe }));
vi.mock('./supabase.js', () => ({ supabase: { from: () => ({ select: () => ({ limit: async () => ({ error: null }) }) }), auth: { admin: { updateUserById: vi.fn(async () => ({ error: null })) } } } }));
vi.mock('./paymentLedger.js', () => ({ applyPayment }));
import { openStripeCheckout, fulfillStripeSession, syncStripeSubscription, processStripeEvent, stripeReady } from './stripeBilling.js';
import { checkoutAmount } from '../../../shared/billingCatalog.js';
const user = { id: 'user-1', app_metadata: { stripe_customer_id: 'cus_1' } };
const now = Math.floor(Date.now()/1000);
const subscription = () => ({ id:'sub_1', customer:'cus_1', metadata:{user_id:'user-1',plan_id:'basic'}, status:'active', latest_invoice:{status:'paid'}, items:{ data:[{price:{id:'price_basic'},current_period_start:now-100,current_period_end:now+86400}] } });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_SECRET_KEY','test-only'); vi.stubEnv('STRIPE_WEBHOOK_SECRET','test-only'); vi.stubEnv('APP_BASE_URL','https://baitbuddy.test');
  for (const id of ['BASIC','PRO','ULTIMATE','FRIENDS']) vi.stubEnv(`STRIPE_PRICE_${id}`,`price_${id.toLowerCase()}`);
  stripe.customers.create.mockResolvedValue({id:'cus_1'});
  stripe.subscriptions.list.mockResolvedValue({data:[]});
  stripe.checkout.sessions.list.mockResolvedValue({data:[]});
  stripe.checkout.sessions.create.mockResolvedValue({id:'cs_1',url:'https://checkout.stripe.com/test'});
  stripe.coupons.create.mockResolvedValue({id:'coupon_1'});
  applyPayment.mockResolvedValue({ok:true,updated:true});
});
describe('canonical prices and checkout',()=>{
  it.each([['basic',899,'subscription'],['pro',1800,'subscription'],['elite',3600,'subscription'],['friends',15000,'subscription'],['premium_24h',499,'payment']])('%s uses its actual price and billing mode',async(id,amount,mode)=>{
    expect(checkoutAmount(id,3000)).toBe(id==='elite'?999:amount);
    await openStripeCheckout(user,id);
    const [params, options] = stripe.checkout.sessions.create.mock.calls[0];
    expect(params.mode).toBe(mode);
    expect(params.customer).toBe('cus_1');
    expect(options.idempotencyKey).toContain('baitbuddy-checkout-cus_1');
    if(mode==='payment') expect(params.line_items[0].price_data.unit_amount).toBe(amount);
    else expect(params.line_items[0].price).toMatch(/^price_/);
    expect(params.payment_method_types).toBeUndefined();
  });
  it('applies referral discount once without discounting renewals',async()=>{
    await openStripeCheckout({...user,app_metadata:{...user.app_metadata,ultimate_discount_cents:3000}},'elite');
    expect(stripe.coupons.create).toHaveBeenCalledWith(expect.objectContaining({amount_off:2601,duration:'once'}),expect.any(Object));
    expect(stripe.checkout.sessions.create.mock.calls[0][0].line_items[0].price).toBe('price_ultimate');
  });
  it('requires webhook, origin and configured price before a purchase',()=>{
    vi.stubEnv('STRIPE_PRICE_BASIC',''); expect(stripeReady('basic')).toBe(false);
    expect(stripeReady('premium_24h')).toBe(true);
    vi.stubEnv('STRIPE_WEBHOOK_SECRET',''); expect(stripeReady('premium_24h')).toBe(false);
  });
  it('blocks duplicate subscriptions and reuses an open checkout',async()=>{
    stripe.subscriptions.list.mockResolvedValueOnce({data:[{status:'active'}]});
    await expect(openStripeCheckout(user,'basic')).rejects.toMatchObject({status:409});
    stripe.checkout.sessions.list.mockResolvedValue({data:[{id:'cs_open',url:'https://checkout.stripe.com/open',metadata:{plan_id:'basic'}}]});
    expect((await openStripeCheckout(user,'basic')).session_id).toBe('cs_open');
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it('rejects a missing/unknown/free plan',async()=>{
    for(const id of [undefined,'free','__proto__','toString']) await expect(openStripeCheckout(user,id)).rejects.toMatchObject({status:400});
  });
});
describe('provider fulfillment',()=>{
  it('requires matching, present account and plan metadata',async()=>{
    stripe.checkout.sessions.retrieve.mockResolvedValue({client_reference_id:'user-1',metadata:{plan_id:'basic'},payment_status:'paid',status:'complete'});
    await expect(fulfillStripeSession('cs_1','user-1','basic')).rejects.toMatchObject({status:403});
    expect(applyPayment).not.toHaveBeenCalled();
  });
  it('does not grant access to unpaid/pending sessions',async()=>{
    stripe.checkout.sessions.retrieve.mockResolvedValue({client_reference_id:'user-1',metadata:{user_id:'user-1',plan_id:'basic'},payment_status:'unpaid',status:'open'});
    await expect(fulfillStripeSession('cs_1','user-1','basic')).rejects.toMatchObject({status:402});
  });
  it('uses the provider expiry on renewal and price id on a tariff change',async()=>{
    const sub=subscription(); sub.items.data[0].price.id='price_pro';
    stripe.subscriptions.retrieve.mockResolvedValue(sub);
    await syncStripeSubscription('sub_1','user-1');
    expect(applyPayment).toHaveBeenCalledWith(expect.objectContaining({planId:'pro',expiresAt:new Date((now+86400)*1000).toISOString(),active:true}));
  });
  it.each(['canceled','unpaid','incomplete','paused','past_due'])('revokes unpaid/inactive %s subscription',async(status)=>{
    stripe.subscriptions.retrieve.mockResolvedValue({...subscription(),status});
    await syncStripeSubscription('sub_1');
    expect(applyPayment).toHaveBeenCalledWith(expect.objectContaining({active:false}));
  });
  it('does not provision an unpaid upgrade',async()=>{
    stripe.subscriptions.retrieve.mockResolvedValue({...subscription(),latest_invoice:{status:'open'}});
    await syncStripeSubscription('sub_1');
    expect(applyPayment).not.toHaveBeenCalled();
  });
  it('uses current provider state for delayed webhook delivery',async()=>{
    stripe.subscriptions.retrieve.mockResolvedValue({...subscription(),status:'canceled'});
    await processStripeEvent({type:'customer.subscription.updated',data:{object:{id:'sub_1',status:'active'}}});
    expect(applyPayment).toHaveBeenCalledWith(expect.objectContaining({active:false}));
  });
  it('uses the same receipt for repeated one-time fulfillment',async()=>{
    stripe.checkout.sessions.retrieve.mockResolvedValue({id:'cs_pass',client_reference_id:'user-1',metadata:{user_id:'user-1',plan_id:'premium_24h'},payment_status:'paid',status:'complete',mode:'payment',created:now-100,currency:'eur',amount_total:499});
    await fulfillStripeSession('cs_pass','user-1','premium_24h');
    await fulfillStripeSession('cs_pass','user-1','premium_24h');
    expect(applyPayment.mock.calls[0][0].reference).toBe(applyPayment.mock.calls[1][0].reference);
    expect(new Date(applyPayment.mock.calls[0][0].expiresAt)-new Date(applyPayment.mock.calls[0][0].startsAt)).toBe(86400000);
  });
});
