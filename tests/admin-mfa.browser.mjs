// Explicit offline browser regression: node tests/admin-mfa.browser.mjs
// Bundles the real component with fake Auth/database adapters. No web server,
// credentials, network calls, real MFA factors, or emails are involved.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const swc = require('next/dist/build/swc');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(path.join(tmpdir(), 'nfc-admin-mfa-browser-'));
let browser;
try {
  await swc.loadBindings();
  for (const [source, target] of [
    ['app/seguranca-admin/AdminMfa.tsx', 'AdminMfa.mjs'],
    ['lib/admin-mfa.ts', 'admin-mfa.mjs'],
  ]) {
    const transformed = await swc.transform(await readFile(path.join(root, source), 'utf8'), {
      filename: source,
      jsc: { parser: { syntax: 'typescript', tsx: source.endsWith('.tsx') }, transform: { react: { runtime: 'automatic' } } },
      module: { type: 'es6' },
    });
    await writeFile(path.join(temporary, target), transformed.code);
  }
  await writeFile(path.join(temporary, 'supabase.mjs'), 'export const createClient = () => window.__mfaClient;');
  await writeFile(path.join(temporary, 'link.mjs'), 'import React from "react"; export default function Link(props) { return React.createElement("a",props); }');
  await writeFile(path.join(temporary, 'entry.mjs'), `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import AdminMfa from './AdminMfa.mjs';
    window.mountMfa = verified => createRoot(document.getElementById('root')).render(React.createElement(AdminMfa, {initiallyVerified:verified}));
  `);
  const compiler = webpack({
    mode: 'development', devtool: false, target: 'web',
    entry: path.join(temporary, 'entry.mjs'),
    output: { path: temporary, filename: 'bundle.js' },
    resolve: {
      modules: [path.join(root, 'node_modules'), 'node_modules'],
      alias: {
        '@/lib/supabase-browser': path.join(temporary, 'supabase.mjs'),
        '@/lib/admin-mfa': path.join(temporary, 'admin-mfa.mjs'),
        'next/link': path.join(temporary, 'link.mjs'),
      },
    },
  });
  await new Promise((resolve, reject) => compiler.run((error, stats) => {
    compiler.close(() => {});
    if (error || stats.hasErrors()) reject(error || new Error(stats.toString({ all: false, errors: true })));
    else resolve();
  }));
  const bundle = await readFile(path.join(temporary, 'bundle.js'), 'utf8');
  const css = await readFile(path.join(root, 'app/seguranca-admin/security.css'), 'utf8');
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const errors = [];
  let callsBeforeNavigation = [];
  await page.exposeFunction('recordMfaCalls', calls => { callsBeforeNavigation = calls; });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    assert.equal(url.origin, 'https://nfc.test', 'Unexpected external request from the security screen');
    await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="pt-BR"><body><div id="root"></div></body></html>' });
  });

  async function mount({ factors = [], initiallyVerified = false, failList = false, dbVerified = true, isAdmin = true } = {}) {
    await page.goto('https://nfc.test/seguranca-admin');
    await page.addStyleTag({ content: '*,*::before,*::after{box-sizing:border-box}body{margin:0;padding:8px}.premium-btn{display:inline-flex;align-items:center;gap:8px}button{cursor:pointer}' + css });
    await page.addScriptTag({ content: bundle });
    await page.evaluate(options => {
      const state = window.__mfaState = { ...options, calls: [], verifyError: null };
      const response = data => ({ data, error: null });
      window.__mfaClient = {
        auth: {
          getUser: async () => response({ user: { id: 'test-admin' } }),
          mfa: {
            listFactors: async () => {
              state.calls.push({ method: 'list' });
              return state.failList ? { error: { code: 'network' } } : response({ all: [...state.factors] });
            },
            enroll: async params => {
              state.calls.push({ method: 'enroll', params });
              const factor = { id: 'new-factor', factor_type: 'totp', status: 'unverified', friendly_name: params.friendlyName };
              state.factors.push(factor);
              return response({ id: factor.id, totp: { secret: 'DUMMY-TEST-ONLY', qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path fill="#111" d="M0 0h100v100H0z"/></svg>' } });
            },
            challengeAndVerify: async params => {
              state.calls.push({ method: 'verify', params });
              if (state.verifyError) return { error: { code: state.verifyError } };
              state.factors = state.factors.map(f => f.id === params.factorId ? { ...f, status: 'verified' } : f);
              return response({});
            },
            unenroll: async params => {
              state.calls.push({ method: 'unenroll', params });
              state.factors = state.factors.filter(f => f.id !== params.factorId);
              await window.recordMfaCalls(state.calls);
              return response({});
            },
          },
        },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => response(state.isAdmin ? { user_id: 'test-admin' } : null) }) }) }),
        rpc: async name => { state.calls.push({ method: 'rpc', name }); return response(state.dbVerified); },
      };
      window.mountMfa(state.initiallyVerified);
    }, { factors, initiallyVerified, failList, dbVerified, isAdmin });
    await page.waitForFunction(() => !document.querySelector('.mfa-loading'));
  }
  const state = () => page.evaluate(() => window.__mfaState);
  const verifiedFactor = { id: 'primary', factor_type: 'totp', status: 'verified', friendly_name: 'Principal' };

  await mount({ failList: true });
  assert.equal(await page.getByRole('button', { name: 'Configurar meu autenticador' }).count(), 0);
  assert.equal(await page.locator('input').count(), 0);
  await page.evaluate(() => { window.__mfaState.failList = false; });
  await page.getByRole('button', { name: 'Carregar autenticadores novamente' }).click();
  await page.getByRole('button', { name: 'Configurar meu autenticador' }).waitFor();
  assert.equal((await state()).calls.filter(c => c.method === 'list').length, 2);
  await page.getByRole('button', { name: 'Configurar meu autenticador' }).click();
  await page.locator('#mfa-enroll-code').waitFor();
  assert.equal((await state()).calls.filter(c => c.method === 'enroll').length, 1);
  assert.match(await page.locator('.mfa-qr').getAttribute('src'), /^data:image\/svg\+xml;utf-8,%3Csvg/);
  await page.getByText('Não consigo ler o QR Code', { exact: true }).click();
  assert.equal(await page.locator('#mfa-manual-secret').getAttribute('type'), 'password');
  await page.getByRole('button', { name: 'Mostrar chave' }).click();
  assert.equal(await page.locator('#mfa-manual-secret').getAttribute('type'), 'text');
  await page.evaluate(() => { window.__mfaState.verifyError = 'mfa_verification_failed'; });
  await page.locator('#mfa-enroll-code').fill('012345');
  await page.getByRole('button', { name: 'Confirmar e entrar na administração' }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'alert');
  assert.equal(page.url(), 'https://nfc.test/seguranca-admin');
  assert.equal((await state()).calls.some(c => c.method === 'rpc'), false);
  assert.equal((await state()).calls.find(c => c.method === 'verify').params.code, '012345');

  await page.evaluate(() => { window.__mfaState.verifyError = null; window.__mfaState.dbVerified = false; });
  await page.getByRole('button', { name: 'Confirmar e entrar na administração' }).click();
  await page.getByText('O código foi confirmado, mas não foi possível liberar a sessão administrativa.', { exact: false }).waitFor();
  assert.equal(page.url(), 'https://nfc.test/seguranca-admin');
  assert.equal(await page.locator('#mfa-manual-secret').count(), 0, 'Setup secret must be cleared after Auth verification');
  await page.evaluate(() => { window.__mfaState.dbVerified = true; });
  await page.locator('#mfa-challenge-code').fill('234567');
  await page.getByRole('button', { name: 'Confirmar e entrar', exact: true }).click();
  await page.waitForURL('https://nfc.test/admin');

  await mount({ factors: [verifiedFactor] });
  assert.equal(await page.getByRole('button', { name: 'Configurar meu autenticador' }).count(), 0);
  assert.equal(await page.locator('#mfa-existing-factor').inputValue(), 'primary');
  await page.locator('#mfa-challenge-code').fill('12');
  await page.getByRole('button', { name: 'Confirmar e entrar', exact: true }).click();
  assert.equal((await state()).calls.some(c => c.method === 'verify'), false);
  await page.locator('#mfa-challenge-code').fill('345678');
  await page.getByRole('button', { name: 'Confirmar e entrar', exact: true }).click();
  await page.waitForURL('https://nfc.test/admin');

  await mount({ factors: [{ id: 'unfinished', factor_type: 'totp', status: 'unverified', friendly_name: 'Incompleto' }] });
  await page.getByText('Configurações não concluídas (1)', { exact: true }).click();
  await page.getByRole('button', { name: 'Cancelar configuração', exact: true }).click();
  await page.getByRole('status').waitFor();
  assert.equal((await state()).calls.find(c => c.method === 'unenroll').params.factorId, 'unfinished');

  await mount({ factors: [verifiedFactor], initiallyVerified: true });
  assert.equal(await page.getByRole('button', { name: 'Remover Principal', exact: true }).count(), 0, 'Keep a replacement path for the only factor');
  await page.getByRole('button', { name: 'Adicionar autenticador de reserva' }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'No horizontal overflow at 375px');
  const size = await page.getByRole('button', { name: 'Adicionar autenticador de reserva' }).boundingBox();
  assert.ok(size.height >= 44);

  await mount({ factors: [verifiedFactor, { ...verifiedFactor, id: 'backup', friendly_name: 'Reserva' }], initiallyVerified: true });
  await page.getByRole('button', { name: 'Remover Principal', exact: true }).click();
  assert.equal(await page.locator('#mfa-kept-factor').inputValue(), 'backup');
  await page.locator('#mfa-remove-code').fill('456789');
  const navigation = page.waitForEvent('framenavigated');
  await page.getByRole('button', { name: 'Confirmar remoção' }).click();
  await navigation;
  const mutationCalls = callsBeforeNavigation.filter(c => c.method !== 'list');
  assert.deepEqual(mutationCalls.map(c => c.method), ['verify', 'unenroll']);
  assert.equal(mutationCalls[0].params.factorId, 'backup');
  assert.equal(mutationCalls[1].params.factorId, 'primary');

  assert.deepEqual(errors, []);
  console.log('Admin MFA browser: load failure/retry, private enrollment, wrong code, database denial, AAL1 challenge, incomplete cancellation, reserve/remove ordering and mobile checks passed. All adapters were offline mocks.');
} finally {
  await browser?.close();
  await rm(temporary, { recursive: true, force: true });
}
