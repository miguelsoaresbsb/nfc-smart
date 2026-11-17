import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import { createPrintKitPdf, printKitFilename, PRINT_KIT_LAYOUT } from '../lib/print-pdf.ts';
import { decidePrintKitAccess } from '../lib/print-kit-access.ts';

const url = 'https://nfc-smart-one.vercel.app/p/cafe-sao-joao';
const document = name => Buffer.from(createPrintKitPdf({ companyName: name, publicUrl: url }));
const textRuns = pdf => [...pdf.toString('latin1').matchAll(/BT \/(F[123]) ([\d.]+) Tf [^\n]*? 1 0 0 1 ([\d.-]+) ([\d.-]+) Tm <([a-f0-9]+)> Tj ET/g)].map(match => ({ font: match[1], size: Number(match[2]), x: Number(match[3]), y: Number(match[4]), value: new TextDecoder('windows-1252').decode(Buffer.from(match[5], 'hex')) }));

test('print material is an A4 PDF with byte-correct streams and cross-reference entries', () => {
  const pdf = document('Café São João');
  const source = pdf.toString('latin1');
  assert(source.startsWith('%PDF-1.4\n'));
  assert(source.endsWith('%%EOF\n'));
  assert.match(source, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.match(source, /\/Count 1\b/);
  assert.equal((source.match(/\/Encoding \/WinAnsiEncoding/g) || []).length, 3);
  const crossReferenceOffset = Number(source.match(/startxref\n(\d+)\n%%EOF/)[1]);
  assert.equal(source.slice(crossReferenceOffset, crossReferenceOffset + 4), 'xref');
  const rows = source.slice(crossReferenceOffset).split('\n');
  assert.equal(rows[1], '0 9');
  assert.equal(rows[2], '0000000000 65535 f ');
  for (let index = 1; index <= 8; index++) {
    const offset = Number(rows[index + 2].slice(0, 10));
    assert.equal(source.slice(offset, offset + `${index} 0 obj`.length), `${index} 0 obj`);
  }
  const stream = source.match(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)endstream/);
  assert.equal(Buffer.byteLength(stream[2], 'latin1'), Number(stream[1]));
  assert(pdf.byteLength < 150_000);
});

test('Portuguese accents print with WinAnsi text and input cannot inject PDF operators', () => {
  const pdf = document('São João — Ação, Café & Açúcar');
  const text = textRuns(pdf).map(run => run.value).join(' ');
  assert.match(text, /São João — Ação, Café & Açúcar/);
  assert.match(text, /NFC requer aparelho compatível/);
  assert.match(text, /TAMANHO REAL \(100%\)/);
  assert(text.includes(url));
  const hostile = document('Empresa ) Tj\nendobj /OpenAction /JavaScript ( teste');
  assert.equal((hostile.toString('latin1').match(/\n\d+ 0 obj\n/g) || []).length, 8);
  assert(!hostile.toString('latin1').includes('/OpenAction'));
  assert(!hostile.toString('latin1').includes('/JavaScript'));
  assert(textRuns(hostile).some(run => run.value.includes('/OpenAction')));
});

test('the actual PDF vector modules encode the exact permanent URL with four-module quiet zone', () => {
  const pdf = document('Minha empresa');
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
  const layout = PRINT_KIT_LAYOUT;
  const scale = layout.qrSize / (qr.modules.size + 8);
  const rendered = new Uint8Array(qr.modules.size * qr.modules.size);
  const section = pdf.toString('ascii').split('% QR-BEGIN\n')[1].split('% QR-END')[0];
  const runs = [...section.matchAll(/^([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re f$/gm)];
  assert(runs.length > 100);
  for (const run of runs) {
    const [x, y, width, height] = run.slice(1).map(Number);
    assert(Math.abs(height - scale) < 0.00011);
    assert(x >= layout.qrLeft + 4 * scale - 0.00011);
    assert(y >= layout.qrBottom + 4 * scale - 0.00011);
    assert(x + width <= layout.qrLeft + layout.qrSize - 4 * scale + 0.00011);
    assert(y + height <= layout.qrBottom + layout.qrSize - 4 * scale + 0.00011);
    const column = Math.round((x - layout.qrLeft) / scale) - 4;
    const row = qr.modules.size - 1 - (Math.round((y - layout.qrBottom) / scale) - 4);
    const count = Math.round(width / scale);
    for (let i = 0; i < count; i++) rendered[row * qr.modules.size + column + i] = 1;
  }
  assert.deepEqual(rendered, qr.modules.data);
});

test('long unbroken names fit on the print sheet and filenames never inject headers', () => {
  const pdf = document('W'.repeat(160));
  const names = textRuns(pdf).filter(run => /^W+$/.test(run.value));
  assert(names.length > 1 && names.length <= 6);
  for (const line of names) {
    assert(line.x >= 50);
    assert(line.x + line.value.length * 0.944 * line.size < PRINT_KIT_LAYOUT.width - 45);
    assert(line.y >= 580);
  }
  assert.equal(printKitFilename('minha-empresa'), 'nfc-smart-material-minha-empresa.pdf');
  assert.match(printKitFilename('../"\r\nX-Evil: yes/😀'), /^nfc-smart-material-[a-z0-9-]+\.pdf$/);
  assert(printKitFilename('x'.repeat(200)).length <= 93);
});

test('material rejects empty names, oversized destinations and executable or authenticated URLs', () => {
  assert.throws(() => createPrintKitPdf({ companyName: ' \n ', publicUrl: url }));
  for (const publicUrl of ['javascript:alert(1)', 'data:text/plain,hello', 'https://user:pass@example.com/p/a', url + '#token', url + '?company_id=other', 'https://example.com/' + 'a'.repeat(600)]) {
    assert.throws(() => createPrintKitPdf({ companyName: 'Empresa', publicUrl }));
  }
});

test('print access requires confirmed identity, approved own membership and finite paid period', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');
  const facts = { user: { id: 'owner', email_confirmed_at: '2026-11-10' }, approvedCompanyIds: ['company'], membership: { user_id: 'owner', company_id: 'company', company: { id: 'company' } }, subscription: { status: 'active', expires_at: '2026-11-12T12:00:00Z' } };
  assert.equal(decidePrintKitAccess(facts, now), 'allowed');
  assert.equal(decidePrintKitAccess({ ...facts, user: null }, now), 'unauthenticated');
  assert.equal(decidePrintKitAccess({ ...facts, user: { id: 'owner' } }, now), 'unconfirmed');
  assert.equal(decidePrintKitAccess({ ...facts, approvedCompanyIds: [] }, now), 'not_approved');
  for (const membership of [null, { ...facts.membership, user_id: 'other' }, { ...facts.membership, company_id: 'foreign' }, { ...facts.membership, company: { id: 'foreign' } }]) {
    assert.equal(decidePrintKitAccess({ ...facts, membership }, now), 'no_membership');
  }
  for (const subscription of [null, { status: 'pending', expires_at: facts.subscription.expires_at }, { status: 'canceled', expires_at: facts.subscription.expires_at }, { status: 'active', expires_at: null }, { status: 'active', expires_at: 'invalid' }, { status: 'active', expires_at: '2026-11-11T12:00:00Z' }]) {
    assert.equal(decidePrintKitAccess({ ...facts, subscription }, now), 'subscription_required');
  }
  // No role/admin claim is accepted as a replacement for company ownership.
  assert.equal(decidePrintKitAccess({ ...facts, user: { ...facts.user, role: 'admin' }, membership: null }, now), 'no_membership');
});
