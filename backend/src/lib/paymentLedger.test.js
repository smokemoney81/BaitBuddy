import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest';
let db;
const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
const now = new Date();
const start=new Date(now.getTime()-1000).toISOString();
const end=new Date(now.getTime()+86400000).toISOString();
const later=new Date(now.getTime()+172800000).toISOString();
beforeAll(async()=>{
 db=new PGlite();
 await db.exec("create schema auth; create role anon; create role authenticated; create role service_role; create table auth.users(id uuid primary key, raw_app_meta_data jsonb, updated_at timestamptz);");
 await db.exec(await readFile(new URL('../../../supabase/migrations/202609190001_verified_payments.sql',import.meta.url),'utf8'));
});
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
 await db.exec('truncate public.verified_payments, auth.users cascade');
 await db.query('insert into auth.users values ($1,\'{}\',now()),($2,\'{}\',now())',[a,b]);
});
async function apply({user=a,ref='a'.repeat(64),plan='pro',expires=end,observed=now.toISOString(),active=true,discount=0,subscription='sub_test'}={}){
 return (await db.query('select public.apply_verified_payment($1,\'stripe\',$2,$3,$4,$5,$6,$7,$8,null,$9) as result',[user,ref,plan,start,expires,observed,active,discount,subscription])).rows[0].result;
}
async function meta(){return (await db.query('select raw_app_meta_data as meta from auth.users where id=$1',[a])).rows[0].meta;}
it('commits a verified purchase and prevents cross-account replay',async()=>{
 await apply();expect((await meta()).premium_plan_id).toBe('pro');
 await expect(apply({user:b})).rejects.toMatchObject({code:'23505'});
});
it('does not extend one-time expiry on replay or replace a stronger purchase',async()=>{
 await apply({plan:'elite'});await apply({ref:'b'.repeat(64),plan:'basic',expires:later});await apply({plan:'elite'});
 expect((await meta()).premium_plan_id).toBe('elite');
 expect(new Date((await meta()).premium_expires_at).getTime()).toBe(new Date(end).getTime());
 expect((await db.query('select * from public.verified_payments')).rows).toHaveLength(2);
});
it('accepts renewal, rejects stale delivery and processes cancellation atomically',async()=>{
 await apply();await apply({expires:later,observed:new Date(now.getTime()+1000).toISOString()});
 await apply({active:false,observed:new Date(now.getTime()-1000).toISOString()});
 expect((await meta()).premium_plan_id).toBe('pro');
 await apply({active:false,observed:new Date(now.getTime()+2000).toISOString()});
 expect((await meta()).premium_plan_id).toBe('free');
});
it('keeps a day pass separate from the existing plan and consumes discounts once',async()=>{
 await db.query('update auth.users set raw_app_meta_data=$1 where id=$2',[JSON.stringify({ultimate_discount_cents:3000}),a]);
 await apply({plan:'elite',discount:2601});await apply({plan:'elite',discount:2601});
 expect((await meta()).ultimate_discount_cents).toBe(399);
 await apply({ref:'c'.repeat(64),plan:'premium_24h'});
 expect((await meta()).premium_plan_id).toBe('elite');expect((await meta()).premium_pass_expires_at).toBeTruthy();
});
it('does not expose receipts or fulfillment RPC to logged-in clients',async()=>{
 const rows=(await db.query("select has_function_privilege('authenticated','public.apply_verified_payment(uuid,text,text,text,timestamptz,timestamptz,timestamptz,boolean,integer,text,text)','execute') as allowed")).rows;
 expect(rows[0].allowed).toBe(false);
});

it('never restarts a day pass on a later callback',async()=>{
 await apply({plan:'premium_24h',subscription:null});
 const replay=await apply({plan:'premium_24h',subscription:null,expires:later,observed:new Date(now.getTime()+5000).toISOString()});
 expect(new Date(replay.expires_at).getTime()).toBe(new Date(end).getTime());
});
