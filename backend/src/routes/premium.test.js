import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
const { user, verify, payment, stripe }=vi.hoisted(()=>({
  user:{id:'user-1',app_metadata:{}}, verify:vi.fn(),payment:vi.fn(),
  stripe:{openStripeCheckout:vi.fn(),openBillingPortal:vi.fn(),fulfillStripeSession:vi.fn(),processStripeEvent:vi.fn(),stripeReady:vi.fn(()=>true)},
}));
vi.mock('../middleware/auth.js',()=>({requireAuth:(req,res,next)=>{req.user=user;next();}}));
vi.mock('../lib/supabase.js',()=>({supabase:{}}));
vi.mock('../lib/purchaseVerification.js',()=>({verifyGooglePlayPurchase:verify,constructStripeWebhookEvent:vi.fn(()=>{throw new Error('signature');})}));
vi.mock('../lib/paymentLedger.js',()=>({applyPayment:payment}));
vi.mock('../lib/stripeBilling.js',()=>stripe);
let app;
beforeEach(async()=>{
  vi.resetModules();vi.clearAllMocks();
  vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON','test-only');vi.stubEnv('STRIPE_SECRET_KEY','test-only');
  user.app_metadata={};
  verify.mockResolvedValue({valid:true,raw:{startTimeMillis:String(Date.now()-1000),expiryTimeMillis:String(Date.now()+86400000)}});
  payment.mockResolvedValue({ok:true,updated:true});
  const {default:router,stripeWebhookHandler}=await import('./premium.js');
  app=express();app.use(express.json());app.post('/webhook',stripeWebhookHandler);app.use('/api',router);
});
describe('Google Play activation boundary',()=>{
  it.each([['basic','baitbuddy_basic_monthly'],['pro','baitbuddy_pro_monthly'],['elite','baitbuddy_ultimate_monthly'],['ultimate','baitbuddy_ultimate_monthly'],['friends','baitbuddy_friends_yearly'],['friends_monthly','baitbuddy_friends_monthly']])('verifies and persists %s',async(plan_id,product_id)=>{
    const res=await request(app).post('/api/premium/activate').send({plan_id,product_id,purchase_token:'token'});
    expect(res.status).toBe(200);expect(payment).toHaveBeenCalledWith(expect.objectContaining({provider:'google_play',planId:plan_id==='ultimate'?'elite':plan_id,reference:'token'}));
  });
  it('rejects a Basic receipt requested as Ultimate before calling Play',async()=>{
    const res=await request(app).post('/api/premium/activate').send({plan_id:'elite',product_id:'baitbuddy_basic_monthly',purchase_token:'token'});
    expect(res.status).toBe(400);expect(verify).not.toHaveBeenCalled();expect(payment).not.toHaveBeenCalled();
  });
  it('rejects unknown product and missing provider timestamps',async()=>{
    verify.mockResolvedValue({valid:true,raw:{}});
    expect((await request(app).post('/api/premium/activate').send({plan_id:'basic',product_id:'baitbuddy_basic_monthly',purchase_token:'token'})).status).toBe(402);
    expect(payment).not.toHaveBeenCalled();
  });
  it('rejects canceled or pending purchases',async()=>{
    verify.mockResolvedValue({valid:false});
    expect((await request(app).post('/api/premium/activate').send({plan_id:'basic',product_id:'baitbuddy_basic_monthly',purchase_token:'token'})).status).toBe(402);
  });
  it('propagates receipt ownership conflicts without granting access',async()=>{
    payment.mockRejectedValueOnce(Object.assign(new Error('Kauf gehört bereits zu einem anderen Konto'),{status:403}));
    expect((await request(app).post('/api/premium/activate').send({plan_id:'basic',product_id:'baitbuddy_basic_monthly',purchase_token:'token'})).status).toBe(403);
  });
});
describe('Stripe endpoints',()=>{
  it('uses the same verified fulfillment for browser return as webhooks',async()=>{
    stripe.fulfillStripeSession.mockResolvedValue({ok:true});
    expect((await request(app).post('/api/premium/activate').send({plan_id:'pro',transaction_id:'cs_1'})).status).toBe(200);
    expect(stripe.fulfillStripeSession).toHaveBeenCalledWith('cs_1','user-1','pro');
  });
  it('rejects unsigned webhooks',async()=>expect((await request(app).post('/webhook').send({})).status).toBe(400));
  it('does not accept arbitrary client pricing',async()=>{
    stripe.openStripeCheckout.mockResolvedValue({ok:true});
    await request(app).post('/api/premium/checkout').send({plan_id:'pro',amount:1});
    expect(stripe.openStripeCheckout).toHaveBeenCalledWith(user,'pro');
  });
});
describe('Free is preserved, feature gates remain server-side',()=>{
  it('keeps Free for accounts without a paid plan',async()=>{
    expect((await request(app).get('/api/premium/status')).body.plan.id).toBe('free');
    expect((await request(app).post('/api/premium/check-feature').send({feature:'offline'})).body.allowed).toBe(false);
  });
  it('ignores writable user_metadata and unknown features',async()=>{
    user.user_metadata={premium_plan_id:'elite'};
    expect((await request(app).post('/api/premium/check-feature').send({feature:'offline'})).body.allowed).toBe(false);
    expect((await request(app).post('/api/premium/check-feature').send({feature:'unknown'})).body.allowed).toBe(false);
    delete user.user_metadata;
  });
});
