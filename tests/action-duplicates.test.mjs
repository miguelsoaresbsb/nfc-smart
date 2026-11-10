import test from 'node:test';
import assert from 'node:assert/strict';
import { actionIdentity, contactIdentities, uniquePublicActions } from '../lib/action-duplicates.ts';

test('legacy direct contacts and equivalent action destinations render once without deleting records',()=>{
 const rows=[{id:'wa',type:'whatsapp',url:'https://api.whatsapp.com/send?phone=5561999999999'},
 {id:'phone',type:'phone',url:'tel:+55 (61) 99999-9999'},
 {id:'site',type:'website',url:'example.com'}, {id:'site-copy',type:'custom',url:'https://example.com/'}];
 const result=uniquePublicActions(rows,{phone:'(61) 99999-9999',whatsapp:'(61) 99999-9999'});
 assert.deepEqual(result.map(x=>x.id),['site']);assert.equal(rows.length,4);
});
test('different phone destinations, messages and anchors keep their distinct functions',()=>{
 const rows=[{type:'whatsapp',url:'https://wa.me/5561999999999?text=Or%C3%A7amento'},
 {type:'whatsapp',url:'https://wa.me/5561988888888'},
 {type:'website',url:'https://example.com/#catalogo'}, {type:'website',url:'https://example.com/#contato'}];
 assert.equal(uniquePublicActions(rows,{whatsapp:'(61) 99999-9999'}).length,4);
 assert.equal(contactIdentities({phone:'invalid',whatsapp:'',phoneEnabled:false}).size,0);
 assert.notEqual(actionIdentity({type:'website',url:'https://wa.me.evil.example/5561999999999'}),actionIdentity({type:'whatsapp',url:'https://wa.me/5561999999999'}));
});
test('PIX amounts and Wi-Fi network settings remain distinct; repeated identical configurations collapse',()=>{
 const rows=[{id:'p1',type:'pix',url:'#pix',pix_key:'key',pix_amount:10},
 {id:'p2',type:'pix',url:'#pix',pix_key:'key',pix_amount:10},
 {id:'p3',type:'pix',url:'#pix',pix_key:'key',pix_amount:20},
 {id:'w1',type:'wifi',url:'#wifi',wifi_ssid:'Clientes',wifi_password:'password'},
 {id:'w2',type:'wifi',url:'#wifi',wifi_ssid:'Clientes',wifi_password:'password'},
 {id:'w3',type:'wifi',url:'#wifi',wifi_ssid:'Equipe',wifi_password:'password'}];
 assert.deepEqual(uniquePublicActions(rows).map(x=>x.id),['p1','p3','w1','w3']);
});
