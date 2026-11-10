import test from 'node:test';
import assert from 'node:assert/strict';
import { finishPasswordRecovery, isSameAuthOrigin, matchesRecoveryIntent, passwordValidation, recoveryIntent, resolveAuthCallback } from '../lib/auth-recovery.ts';
const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
test('password endpoint checks the public Host and rejects cross-origin or malformed requests',()=>{
 assert.equal(isSameAuthOrigin('http://localhost:3000','localhost:3000','http:'),true);
 assert.equal(isSameAuthOrigin('https://nfc-smart-one.vercel.app','nfc-smart-one.vercel.app','https:'),true);
 for(const origin of [null,'null','https://evil.example','https://nfc-smart-one.vercel.app.evil.example','http://nfc-smart-one.vercel.app','https://user@nfc-smart-one.vercel.app','https://nfc-smart-one.vercel.app/path']) assert.equal(isSameAuthOrigin(origin,'nfc-smart-one.vercel.app','https:'),false);
 assert.equal(isSameAuthOrigin('https://evil.example','evil.example@trusted.example','https:'),false);
});
function client(overrides={}){const calls=[];return {calls,auth:{
  exchangeCodeForSession:async(...args)=>{calls.push(['exchange',...args]);return {data:{redirectType:'recovery'},error:null}},
  verifyOtp:async(args)=>{calls.push(['verify',args]);return {error:null}},
  getUser:async()=>({data:{user:{id:uid}},error:null}),
  getClaims:async()=>({data:{claims:{session_id:sid}},error:null}),
  updateUser:async(args)=>{calls.push(['update',args]);return {error:null}},
  signOut:async()=>{calls.push(['signout']);return {error:null}},...overrides}}}
test('only verified PKCE recovery establishes intent; concurrent flow id is forwarded',async()=>{
 const c=client();const result=await resolveAuthCallback(new URLSearchParams('code=one-use&sb_flow_id=flow-id&next=//evil.example'),c.auth);
 assert.equal(result.path,'/redefinir-senha');assert.equal(result.recovery,true);assert.deepEqual(c.calls,[['exchange','one-use',{flowId:'flow-id'}]]);
 const ordinary=client({exchangeCodeForSession:async()=>({data:{user:{id:uid},redirectType:null},error:null})});
 const noProof=await resolveAuthCallback(new URLSearchParams('code=signup-code&type=recovery&next=/redefinir-senha'),ordinary.auth);
 assert.equal(noProof.recovery,false);assert.equal(noProof.path,'/dashboard');
});
test('token hash recovery is verified while invalid/expired callback never uses existing session',async()=>{
 const c=client();const result=await resolveAuthCallback(new URLSearchParams('token_hash=one-time-hash&type=recovery'),c.auth);
 assert.equal(result.recovery,true);assert.deepEqual(c.calls,[['verify',{token_hash:'one-time-hash',type:'recovery'}]]);
 const expired=client({verifyOtp:async()=>({error:{code:'otp_expired'}})});
 assert.equal((await resolveAuthCallback(new URLSearchParams('token_hash=expired&type=recovery'),expired.auth)).failed,true);
 assert.equal((await resolveAuthCallback(new URLSearchParams('type=recovery'),c.auth)).failed,true);
 assert.equal((await resolveAuthCallback(new URLSearchParams('error_code=otp_expired&code=ignore'),c.auth)).failed,true);
 assert.equal((await resolveAuthCallback(new URLSearchParams('token_hash=hash&type=not-supported'),c.auth)).failed,true);
});
test('recovery marker is session-bound and expires, password confirmation has bounded length',()=>{
 const now=Date.now(), marker=recoveryIntent(uid,sid,now);
 assert.equal(matchesRecoveryIntent(marker,uid,sid,now),true);
 assert.equal(matchesRecoveryIntent(marker,uid,'another-session',now),false);
 assert.equal(matchesRecoveryIntent(marker,'another-user',sid,now),false);
 assert.equal(matchesRecoveryIntent(marker,uid,sid,now+21*60*1000),false);
 assert.equal(matchesRecoveryIntent(marker,uid,sid,now-120000),false);
 assert.match(passwordValidation('short','short'),/8/);
 assert.match(passwordValidation('long-password','different-password'),/coincidem/);
 assert.match(passwordValidation('a'.repeat(129),'a'.repeat(129)),/128/);
 assert.equal(passwordValidation('Good-password-2026','Good-password-2026'),null);
});
test('unverified or expired sessions cannot reach password update',async()=>{
 for(const override of [{getUser:async()=>({data:{user:null},error:{code:'session_not_found'}})},{getClaims:async()=>({data:null,error:{message:'invalid JWT'}})},{getClaims:async()=>({data:{claims:{session_id:'wrong'}},error:null})}]){
  const c=client(override);const result=await finishPasswordRecovery(c.auth,recoveryIntent(uid,sid),'Good-password-2026','Good-password-2026');
  assert.equal(result.status,401);assert.equal(result.clearIntent,true);assert.equal(c.calls.length,0);
 }
 const c=client();assert.equal((await finishPasswordRecovery(c.auth,undefined,'Good-password-2026','Good-password-2026')).status,401);assert.equal(c.calls.length,0);
});
test('verified recovery updates once, clears intent and signs out before returning to login',async()=>{
 const c=client();const result=await finishPasswordRecovery(c.auth,recoveryIntent(uid,sid),'Good-password-2026','Good-password-2026');
 assert.equal(result.status,200);assert.deepEqual(result.body,{ok:true,signoutFailed:false});assert.equal(result.clearIntent,true);
 assert.deepEqual(c.calls,[['update',{password:'Good-password-2026'}],['signout']]);
});
test('password provider errors are translated and failed signout never reports password failure',async()=>{
 const weak=client({updateUser:async()=>({error:{code:'weak_password',message:'private internals'}})});
 const rejected=await finishPasswordRecovery(weak.auth,recoveryIntent(uid,sid),'Good-password-2026','Good-password-2026');
 assert.equal(rejected.status,400);assert.match(rejected.body.error,/mais forte/);assert.equal(JSON.stringify(rejected).includes('private internals'),false);assert.equal(rejected.clearIntent,false);
 const failedSignout=client({signOut:async()=>({error:{message:'network'}})});
 const saved=await finishPasswordRecovery(failedSignout.auth,recoveryIntent(uid,sid),'Good-password-2026','Good-password-2026');
 assert.equal(saved.status,200);assert.equal(saved.body.signoutFailed,true);assert.equal(saved.clearIntent,true);
});
