import test from 'node:test';
import assert from 'node:assert/strict';
import { caktoFailureDiagnostic, handleCaktoWebhook } from '../supabase/functions/_shared/cakto.ts';

const config = { secret: 'monitor-test-only', productId: 'nfc-product', monthlyAmount: 29.9 };
const source = { id: 'order-1', status: 'paid', amount: 29.9, currency: 'BRL', paidAt: '2026-01-20T12:00:00Z', product: { id: 'nfc-product', type: 'subscription' }, customer: { email: 'private-buyer@example.invalid', password: 'do-not-store' }, subscription: { id: 'contract-1' } };
const request = (overrides = {}, record = source) => new Request('https://example.invalid/webhook', { method: 'POST', body: JSON.stringify({ secret: config.secret, event: 'purchase_approved', data: record, ...overrides }) });

test('diagnostics whitelist fields and reason codes without identities or arbitrary error text', () => {
  const diagnostic = caktoFailureDiagnostic('purchase_approved', source, config, new Error('approved_company_not_found'));
  assert.deepEqual(diagnostic, { event_type: 'purchase_approved', order_id: 'order-1', subscription_id: 'contract-1', product_id: 'nfc-product', reason_code: 'approved_company_not_found' });
  assert.equal(caktoFailureDiagnostic('purchase_approved', source, config, new Error('private-buyer@example.invalid')).reason_code, 'processing_failed');
  for (const patch of [{ id: 'buyer@example.invalid' }, { id: 'name with spaces' }, { subscription: { id: 'token@secret.invalid' } }, { product: { id: 'other' } }]) assert.equal(caktoFailureDiagnostic('purchase_approved', { ...source, ...patch }, config, new Error()), null);
  assert.equal(caktoFailureDiagnostic('unrelated-event', source, config, new Error()), null);
});

test('unauthenticated requests cannot generate operational alerts', async () => {
  let calls = 0;
  const db = () => { calls++; throw Error('Unexpected database access'); };
  assert.equal((await handleCaktoWebhook(request({ secret: 'wrong' }), config, db)).status, 401);
  const signed = request(); signed.headers.set('x-cakto-signature', 'v1=wrong');
  assert.equal((await handleCaktoWebhook(signed, config, db)).status, 401);
  assert.equal(calls, 0);
});

test('authenticated activation failures are recorded separately and remain retryable', async () => {
  const calls = [];
  const response = await handleCaktoWebhook(request(), config, () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { error: name === 'process_cakto_event' ? { message: 'approved_company_not_found' } : null }; } }));
  assert.equal(response.status, 503);
  assert.deepEqual(calls.map(c => c.name), ['process_cakto_event', 'record_cakto_failure']);
  const logged = JSON.stringify(calls[1]);
  for (const sensitive of [config.secret, source.customer.email, source.customer.password, 'customer_email']) assert.equal(logged.includes(sensitive), false);
});

test('monitoring outages never swallow a payment failure; successful processing adds no alert', async () => {
  const calls = [];
  const failure = await handleCaktoWebhook(request(), config, () => ({ rpc: async (name) => { calls.push(name); if (name === 'record_cakto_failure') throw Error('monitor unavailable'); return { error: { message: 'database unavailable' } }; } }));
  assert.equal(failure.status, 503);
  const successCalls = [];
  const success = await handleCaktoWebhook(request(), config, () => ({ rpc: async name => { successCalls.push(name); return { error: null }; } }));
  assert.equal(success.status, 200);
  assert.deepEqual(successCalls, ['process_cakto_event']);
});

test('invalid authenticated prices alert without invoking paid activation', async () => {
  const calls = [];
  const result = await handleCaktoWebhook(request({}, { ...source, amount: 1 }), config, () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; } }));
  assert.equal(result.status, 503);
  assert.deepEqual(calls.map(c => c.name), ['record_cakto_failure']);
  assert.equal(calls[0].args.p_failure.reason_code, 'invalid_payment_amount');
});
