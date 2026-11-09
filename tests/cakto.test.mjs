import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { normalizeCaktoOrder, validCaktoSignature, handleCaktoWebhook } from '../supabase/functions/_shared/cakto.ts';
const config = { secret: 'test-secret', productId: 'nfc-product', monthlyAmount: 29.9 };
const order = { id:'order-1', status:'paid', amount:29.9, currency:'BRL', paidAt:'2026-01-31T12:00:00Z', product:{id:'nfc-product',type:'subscription'}, customer:{id:1,email:' BUYER@EXAMPLE.COM '}, subscription:{id:'contract-1'} };
const request = (payload, headers = {}) => new Request('https://example.com/webhook', {method:'POST',headers,body:JSON.stringify(payload)});
test('payment period is deterministic, handles month end and normalizes email', () => {
  const event = normalizeCaktoOrder('purchase_approved', order, config);
  assert.equal(event.period_end, '2026-02-28T12:00:00.000Z');
  assert.equal(event.customer_email, 'buyer@example.com');
  assert.deepEqual(event, normalizeCaktoOrder('purchase_approved', order, config));
  assert.equal(normalizeCaktoOrder('subscription_renewed', order, config).period_end, event.period_end);
});
test('uses Cakto next period and recurrence, rejects unpaid/wrong-value/wrong-currency', () => {
  assert.equal(normalizeCaktoOrder('purchase_approved',{...order,subscription:{id:'c',next_payment_date:'2026-03-01T12:00:00Z'}},config).period_end,'2026-03-01T12:00:00.000Z');
  assert.equal(normalizeCaktoOrder('purchase_approved',{...order,subscription:{id:'c',recurrence_period:30}},config).period_end,'2026-03-02T12:00:00.000Z');
  for (const patch of [{status:'waiting_payment'},{amount:1},{currency:'USD'},{paidAt:null}]) assert.throws(()=>normalizeCaktoOrder('purchase_approved',{...order,...patch},config));
});
test('ignores unrelated V2 products and unsupported nonpurchase events', () => {
  assert.equal(normalizeCaktoOrder('purchase_approved',{...order,product:{id:'other'}},config),null);
  assert.equal(normalizeCaktoOrder('checkout_abandonment',{},config),null);
});
test('verifies raw signatures, transition versions, replay cutoff and tampering', async () => {
  const raw='{"hello":1}', ts='1794248400';
  const signature='v1='+createHmac('sha256',config.secret).update(ts+'.'+raw).digest('hex');
  assert.equal(await validCaktoSignature(raw,ts,signature,config.secret,Number(ts)*1000),true);
  assert.equal(await validCaktoSignature(raw,ts,'v2=future, '+signature,config.secret,Number(ts)*1000),true);
  assert.equal(await validCaktoSignature(raw+' ',ts,signature,config.secret,Number(ts)*1000),false);
  assert.equal(await validCaktoSignature(raw,ts,signature,config.secret,(Number(ts)+301)*1000),false);
});
test('handler rejects malformed bodies and auth before touching database', async () => {
  const db=()=>{throw Error('database must not be used')};
  for (const data of [null,{},[],{secret:'wrong',event:'purchase_approved',data:order}]) assert.equal((await handleCaktoWebhook(request(data),config,db)).status,data&&data.secret==='wrong'?401:data&&typeof data==='object'&&!Array.isArray(data)?401:400);
  assert.equal((await handleCaktoWebhook(request({secret:config.secret,event:'purchase_approved',data:null}),config,db)).status,400);
  assert.equal((await handleCaktoWebhook(request({secret:config.secret,event:'purchase_approved',data:order},{'x-cakto-timestamp':'1'}),config,db)).status,401);
});
test('body-secret compatibility and V2 invoke only atomic RPC, without persisting secret', async () => {
  const calls=[];
  const result=await handleCaktoWebhook(request({secret:config.secret,event:'purchase_approved',data:[order,{...order,product:{id:'other'}}]}),config,()=>({rpc:async(name,args)=>{calls.push({name,args});return {error:null}}}));
  assert.equal(result.status,200);
  assert.deepEqual(await result.json(),{ok:true,processed:1,ignored:1});
  assert.equal(calls[0].name,'process_cakto_event');
  assert.equal(JSON.stringify(calls).includes(config.secret),false);
});
