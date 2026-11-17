import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAdminMfaClaims, normalizeTotpCode, totpQrImage, mfaErrorMessage } from '../lib/admin-mfa.ts';

const uid='831ac888-9a44-4fcb-a001-000000000001';
const sid='831ac888-9a44-4fcb-a001-000000000002';

test('admin MFA server claims require aal2 and the same verified user and session',()=>{
 const verified={claims:{sub:uid,aal:'aal2',session_id:sid}};
 assert.equal(hasAdminMfaClaims(verified,uid),true);
 for(const data of [null,{}, {claims:null},{claims:{...verified.claims,sub:'another-user'}},{claims:{...verified.claims,aal:'aal1'}},{claims:{...verified.claims,aal:undefined}},{claims:{...verified.claims,session_id:'not-a-session'}},{claims:{...verified.claims,session_id:123}},{claims:{sub:uid,user_metadata:{aal:'aal2',session_id:sid}}}])assert.equal(hasAdminMfaClaims(data,uid),false);
});

test('TOTP preserves leading zeros and accepts only six actual numeric characters',()=>{
 assert.equal(normalizeTotpCode(' 012 345 '),'012345');
 assert.equal(normalizeTotpCode('000000'),'000000');
 for(const code of [123456,undefined,null,'12345','1234567','12a345','１２３４５６','1e0000','<12345'])assert.equal(normalizeTotpCode(code),null);
});

test('QR renders as an encoded SVG image and never as executable markup',()=>{
 const raw='<svg xmlns="http://www.w3.org/2000/svg"><path fill="#111"/></svg>';
 assert.equal(totpQrImage(raw),'data:image/svg+xml;utf-8,'+encodeURIComponent(raw));
 assert.equal(totpQrImage('data:image/svg+xml;utf-8,'+raw),totpQrImage(raw));
 assert.throws(()=>totpQrImage('https://untrusted.example/secret'));
 assert.throws(()=>totpQrImage('<script>alert(1)</script>'));
});

test('MFA errors give recovery guidance without exposing raw provider messages or secrets',()=>{
 assert.match(mfaErrorMessage('mfa_verification_failed'),/código mais recente/);
 assert.match(mfaErrorMessage('insufficient_aal'),/Entre novamente/);
 assert.match(mfaErrorMessage('mfa_factor_limit_exceeded'),/configuração incompleta/);
 assert.match(mfaErrorMessage('too_many_enrolled_mfa_factors'),/configuração incompleta/);
 assert.match(mfaErrorMessage('mfa_factor_name_conflict'),/outro nome/);
 const generic=mfaErrorMessage('secret-user-data@example.invalid');
 assert.equal(generic.includes('secret-user-data'),false);
 assert.match(generic,/Não compartilhe/);
});
