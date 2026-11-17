import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Exercise the actual server guard with request-scoped Auth/database adapters.
// The browser UI cannot grant the result of this check.
const key = '__nfcAdminMfaGuardFixture';
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const source = specifier === '@/lib/supabase-server'
      ? `export const createClient=async()=>globalThis.${key};`
      : specifier === 'next/navigation'
        ? 'export function redirect(path){throw Object.assign(new Error("redirect"),{path,code:"TEST_REDIRECT"})}'
        : null;
    if (source) return { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true };
    if (specifier === '@/lib/admin-mfa') return { url: new URL('../lib/admin-mfa.ts', import.meta.url).href, shortCircuit: true };
    if (specifier === '@/lib/subscription-access') return { url: new URL('../lib/subscription-access.ts', import.meta.url).href, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { getAuthorizedAccess, getAdminSecurityAccess, requirePaidAccess } = await import('../lib/auth-guard.ts');
hooks.deregister();

const uid = '831ac888-9a44-4fcb-a001-000000000001';
const sid = '831ac888-9a44-4fcb-a001-000000000002';
const user = { id: uid, email_confirmed_at: '2026-11-17T00:00:00.000Z' };
const claims = { claims: { sub: uid, aal: 'aal2', session_id: sid } };

function fixture(options = {}) {
  const calls = [];
  const result = (data, error = null) => ({ data, error });
  globalThis[key] = {
    auth: {
      getUser: async () => result({ user: options.user === undefined ? user : options.user }, options.authError),
      getClaims: async () => { calls.push('claims'); return result(options.claims === undefined ? claims : options.claims); },
    },
    rpc: async name => { calls.push(name); return result(options.liveMfa ?? true, options.rpcError); },
    from: table => {
      calls.push(table);
      const response = table === 'platform_admins' ? result(options.isAdmin === false ? null : { user_id: uid })
        : table === 'access_requests' ? result(options.pending ? [] : [{ company_id: 'company-1' }])
          : table === 'company_members' ? result({ role: 'editor', companies: { id: 'company-1', slug: 'test', name: 'Test' } })
            : table === 'subscriptions' ? result({ status: 'active', expires_at: options.expired ? '2000-01-01T00:00:00.000Z' : '2999-01-01T00:00:00.000Z' })
              : result(null, { message: 'Unexpected table' });
      const query = {
        select: () => query, eq: () => query, in: () => query, not: () => query, order: () => query, limit: () => query,
        maybeSingle: async () => response,
        then: (resolve, reject) => Promise.resolve(response).then(resolve, reject),
      };
      return query;
    },
  };
  return calls;
}
const redirects = path => error => error.code === 'TEST_REDIRECT' && error.path === path;

test('admin server gate requires both verified AAL2 claims and live database authorization', async () => {
  let calls = fixture({ claims: { claims: { ...claims.claims, aal: 'aal1' } } });
  await assert.rejects(getAuthorizedAccess, redirects('/seguranca-admin'));
  assert.deepEqual(calls, ['platform_admins', 'claims']);

  calls = fixture({ claims: { claims: { ...claims.claims, sub: 'other-user' } } });
  await assert.rejects(getAuthorizedAccess, redirects('/seguranca-admin'));
  assert.equal(calls.includes('admin_mfa_verified'), false);

  calls = fixture({ liveMfa: false });
  await assert.rejects(getAuthorizedAccess, redirects('/seguranca-admin'));
  assert.deepEqual(calls, ['platform_admins', 'claims', 'admin_mfa_verified']);

  calls = fixture();
  const access = await getAuthorizedAccess();
  assert.equal(access.isAdmin, true);
  assert.equal(access.hasPaidAccess, true);
  assert.equal(access.company, null);
  assert.deepEqual(calls, ['platform_admins', 'claims', 'admin_mfa_verified']);
});

test('security enrollment bootstrap is reachable at AAL1 only for the confirmed administrator', async () => {
  fixture({ claims: { claims: { ...claims.claims, aal: 'aal1' } } });
  const access = await getAdminSecurityAccess();
  assert.equal(access.user.id, uid);
  assert.equal(access.mfaVerified, false);

  const customerCalls = fixture({ isAdmin: false });
  await assert.rejects(getAdminSecurityAccess, redirects('/dashboard'));
  assert.equal(customerCalls.includes('claims'), false);

  const unconfirmedCalls = fixture({ user: { ...user, email_confirmed_at: null } });
  await assert.rejects(getAdminSecurityAccess, redirects('/login?auth_error=confirm'));
  assert.deepEqual(unconfirmedCalls, []);
  fixture({ user: null });
  await assert.rejects(getAdminSecurityAccess, redirects('/login'));
});

test('failed live MFA lookup fails closed with a safe error', async () => {
  const calls = fixture({ rpcError: { message: 'PRIVATE_DATABASE_DETAILS' } });
  await assert.rejects(getAuthorizedAccess, error => error.message.includes('segunda etapa') && !error.message.includes('PRIVATE_DATABASE_DETAILS'));
  assert.equal(calls.includes('subscriptions'), false);
});

test('customer approval and payment checks continue without administrator MFA privileges', async () => {
  const calls = fixture({ isAdmin: false });
  const access = await requirePaidAccess();
  assert.equal(access.isAdmin, false);
  assert.equal(access.hasPaidAccess, true);
  assert.equal(access.company.id, 'company-1');
  assert.equal(calls.includes('claims'), false);
  assert.equal(calls.includes('admin_mfa_verified'), false);

  fixture({ isAdmin: false, pending: true });
  await assert.rejects(getAuthorizedAccess, redirects('/acesso-pendente'));
  fixture({ isAdmin: false, expired: true });
  await assert.rejects(requirePaidAccess, redirects('/dashboard/subscription?required=1'));
});
