import test from 'node:test';
import assert from 'node:assert/strict';
import { actionPayload, emptyActionForm, formFromAction, moveAction } from '../lib/action-editor.ts';
test('editing preserves stored payment fields and visibility/order is never changed implicitly',()=>{
 const form=formFromAction({id:'one',type:'pix',label:'Pagar',url:'#pix',icon:'pix',position:6,enabled:false,pix_key:'recebedor@example.com',pix_amount:29.9});
 const p=actionPayload(form);assert.equal(p.pix_key,'recebedor@example.com');assert.equal(p.pix_amount,29.9);assert(!('enabled' in p));assert(!('position' in p));
});
test('type changes clear irrelevant PIX and Wi-Fi fields instead of retaining hidden credentials',()=>{
 const p=actionPayload({...emptyActionForm('instagram'),url:'@empresa',pixKey:'hidden',wifiPassword:'old-secret'});
 assert.equal(p.url,'https://www.instagram.com/empresa/');assert.equal(p.pix_key,null);assert.equal(p.wifi_password,null);
});
test('QR-only PIX is valid and invalid amounts/unsafe targets are rejected',()=>{
 assert.equal(actionPayload({...emptyActionForm('pix'),pixQrCodeId:'qr'}).pix_qr_code_id,'qr');
 assert.throws(()=>actionPayload({...emptyActionForm('pix'),pixKey:'key',pixAmount:'NaN'}));
 assert.throws(()=>actionPayload({...emptyActionForm('custom'),url:'javascript:alert(1)'}));
});
test('open Wi-Fi clears password and moving actions keeps every item exactly once',()=>{
 assert.equal(actionPayload({...emptyActionForm('wifi'),wifiSsid:'Minha rede',wifiSecurity:'nopass',wifiPassword:'stale'}).wifi_password,null);
 const rows=[{id:'a'},{id:'b'},{id:'c'}];assert.deepEqual(moveAction(rows,'c','a').map(r=>r.id),['c','a','b']);assert.deepEqual(rows.map(r=>r.id),['a','b','c']);assert.deepEqual(moveAction(rows,'absent','a'),rows);
});
