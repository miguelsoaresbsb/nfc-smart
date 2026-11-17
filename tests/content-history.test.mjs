import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContentHistory, historyOperationLabel, historyRestoreError } from '../lib/content-history.ts';

const version = () => ({ id:'6b51bc9b-4c33-4d5a-a001-000000000001', created_at:'2026-11-17T12:00:00Z', actor_id:null, operation:'action', summary:{ name:'Clínica São José', description:'Contatos da equipe', action_count:2, buttons:[{label:'WhatsApp',enabled:true},{label:'Catálogo',enabled:false}] } });
const response = () => ({ revision:'0123456789abcdef0123456789abcdef', versions:[version()] });

test('history decodes only saved summaries and preserves Portuguese and hidden buttons', () => {
  const result = parseContentHistory(response());
  assert.equal(result.versions[0].summary.name,'Clínica São José');
  assert.deepEqual(result.versions[0].summary.buttons,[{label:'WhatsApp',enabled:true},{label:'Catálogo',enabled:false}]);
  assert.equal(historyOperationLabel(result.versions[0].operation),'Botões');
  assert.deepEqual(parseContentHistory({...response(),versions:[]}).versions,[]);
});

test('history rejects malformed identities, revisions and unknown operations', () => {
  for (const value of [null, {}, {...response(),revision:'stale'}, {...response(),versions:Array.from({length:31},version)}, {...response(),versions:[{...version(),id:'other-company'}]}, {...response(),versions:[{...version(),created_at:'invalid'}]}, {...response(),versions:[{...version(),operation:'subscription'}]}, {...response(),versions:[{...version(),operation:'__proto__'}]}, {...response(),versions:[{...version(),summary:{name:'A',action_count:-1,buttons:[]}}]}]) assert.throws(()=>parseContentHistory(value));
});

test('history bounds display fields and never accepts client-supplied snapshot fields', () => {
  const source=version(); source.actor_id='not-a-uuid';
  source.summary={name:'N'.repeat(500),description:'D'.repeat(2000),action_count:12,buttons:Array.from({length:12},(_,i)=>({label:'B'.repeat(200),enabled:i===0}))};
  source.snapshot={subscription:{status:'active'},wifi_password:'private'};
  const result=parseContentHistory({...response(),versions:[source]}).versions[0];
  assert.equal(result.actor_id,null); assert.equal(result.summary.name.length,160);
  assert.equal(result.summary.description.length,500); assert.equal(result.summary.buttons.length,8);
  assert.equal(result.summary.buttons[0].label.length,100); assert.equal(Object.hasOwn(result,'snapshot'),false);
});

test('restore feedback explains stale data, permissions and uncertainty without raw backend messages', () => {
  assert.match(historyRestoreError('40001'),/outra aba/);
  assert.match(historyRestoreError('55P03'),/outra sessão/);
  assert.match(historyRestoreError('42501'),/assinatura ativa/);
  assert.match(historyRestoreError('22023'),/não está mais disponível/);
  assert.match(historyRestoreError('provider secret detail'),/Atualize o histórico/);
  assert.equal(historyRestoreError('provider secret detail').includes('provider secret'),false);
});
