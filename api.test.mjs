import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {d1,migrate,seed,client} from './test-support.mjs';

test('persistent database lifecycle, permissions, PK isolation, revision history and stale updates',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'frame-api-')),path=join(dir,'test.sqlite');let db=new DatabaseSync(path);migrate(db);seed(db,'IntegrationOnly!2026');let env={DB:d1(db)},call=client(env);
 try{
  assert.equal((await call('anon','/api/schedule')).status,401);
  assert.equal((await call('EMEN','/api/login',{username:'emen',password:'Password123'})).status,401);
  for(const user of ['EMEN','EVAN','DEDY','BOWO','AGUS'])assert.equal((await call(user,'/api/login',{username:user,password:'IntegrationOnly!2026'})).status,200);
  const month='2026-11',get=async(user='EMEN')=>(await call(user,'/api/schedule?month='+month)).body;
  const write=async(user,action,extra={},snapshot)=>{const s=snapshot||await get(user);return call(user,'/api/schedule/'+action,{month,revision:s.revision,availabilityRevision:s.availabilityRevision,...extra})};
  assert.equal((await call('AGUS','/api/availability',{kind:'month_off',month})).status,201);
  assert.ok((await get()).availability.some(x=>x.member==='AGUS'));
  assert.equal((await get('DEDY')).availability,undefined);
  assert.equal((await write('DEDY','generate')).status,403);
  assert.equal((await write('EMEN','generate')).status,200);
  let s=await get();assert.equal(s.draft.length,110);assert.ok(s.draft.every(x=>x.member!=='AGUS'));assert.equal(s.issues.length,0);
  const first=s.draft[0],old=s.revision;
  assert.equal((await write('EMEN','assign',{index:0,member:null},s)).status,200);
  assert.equal((await write('EMEN','assign',{index:1,member:null},s)).status,409);
  assert.equal((await write('EMEN','submit')).status,409);
  assert.equal((await write('EMEN','assign',{index:0,member:first.member})).status,200);
  assert.equal((await write('EVAN','assign',{index:0,member:null})).status,403);
  assert.equal((await write('EMEN','submit')).status,200);
  assert.equal((await write('EMEN','assign',{index:0,member:null})).status,409);
  let pending=await get('EVAN');
  assert.equal((await call('DEDY','/api/availability',{kind:'day',date:'2026-11-02'})).status,201);
  assert.equal((await write('EVAN','approve',{},pending)).status,409);
  assert.equal((await write('EMEN','approve')).status,403);
  assert.equal((await write('EVAN','reject',{note:'Periksa kembali pemerataan.'})).status,200);
  assert.equal((await get()).approvalNote,'Periksa kembali pemerataan.');
  assert.equal((await write('EMEN','submit')).status,200);
  assert.equal((await write('EVAN','approve')).status,200);
  s=await get();const published=structuredClone(s.published);assert.equal(s.history[0].actor,'EVAN');assert.equal(s.history[0].action,'approve');
  const member=await get('DEDY');assert.equal(member.draft,null);assert.equal(member.totals,null);assert.equal(member.candidates,undefined);assert.equal(member.history,undefined);assert.ok(member.published.length>0);assert.ok(member.teammates.some(x=>x.member!=='DEDY'));assert.ok(member.teammates.every(x=>!('amount'in x)));assert.ok(member.published.every(x=>x.member==='DEDY'&&!('amount'in x)));assert.equal(member.ownPK,s.totals.DEDY);assert.equal(Object.keys(member.counts).length,14);
  assert.equal((await call('EMEN','/api/cash',{member:'DEDY',status:'paid'})).status,403);
  assert.equal((await call('BOWO','/api/cash',{member:'DEDY',status:'paid'})).status,200);
  assert.equal((await call('DEDY','/api/state')).body.cash.DEDY,'paid');
  assert.equal((await write('EMEN','revise')).status,200);assert.deepEqual((await get()).draft,published);assert.deepEqual((await get()).published,published);
  assert.equal((await write('EMEN','generate')).status,200);assert.deepEqual((await get()).published,published);
  assert.equal((await get('DEDY')).status,'published');
  // D1 trigger stores before/after snapshots for each successfully committed mutation.
  const history=db.prepare('SELECT * FROM schedule_history WHERE action=?').get('assign');assert.ok(JSON.parse(history.before_json).draft[0].member);assert.equal(JSON.parse(history.after_json).draft[0].member,null);
  db.close();db=new DatabaseSync(path);env.DB=d1(db);
  assert.deepEqual((await get()).published,published);assert.equal((await call('DEDY','/api/state')).body.cash.DEDY,'paid');assert.ok((await get()).revision>old);
 }finally{db.close();rmSync(dir,{recursive:true,force:true})}
});

test('availability changes flag existing drafts and prevent submission',async()=>{
 const db=new DatabaseSync(':memory:');migrate(db);seed(db,'IntegrationOnly!2026');const call=client({DB:d1(db)});
 try{for(const u of ['EMEN','DEDY'])await call(u,'/api/login',{username:u,password:'IntegrationOnly!2026'});
 const month='2027-01';let s=(await call('EMEN','/api/schedule?month='+month)).body;await call('EMEN','/api/schedule/generate',{month,revision:s.revision,availabilityRevision:s.availabilityRevision});
 s=(await call('EMEN','/api/schedule?month='+month)).body;const date=s.draft.find(x=>x.member==='DEDY').date;assert.equal((await call('DEDY','/api/availability',{kind:'day',date})).status,201);
 s=(await call('EMEN','/api/schedule?month='+month)).body;assert.ok(s.issues.some(x=>x.reason.includes('Izin')));assert.equal((await call('EMEN','/api/schedule/submit',{month,revision:s.revision,availabilityRevision:s.availabilityRevision})).status,409);
 }finally{db.close()}
});
