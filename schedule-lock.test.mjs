import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {d1,migrate,seed,client} from './test-support.mjs';import {swapAssignments} from './schedule-view.js';
test('monthly lock before/pending/approved; DB bypass; exchange; swap and reapproval',async()=>{
 const db=new DatabaseSync(':memory:');migrate(db);seed(db,'LockTestOnly!2026');const call=client({DB:d1(db)});for(const user of ['EMEN','EVAN','AYU','BOWO'])await call(user,'/api/login',{username:user,password:'LockTestOnly!2026'});
 const get=async(user='EMEN')=>(await call(user,'/api/schedule?month=2026-11')).body;
 const act=async(user,action,extra={})=>{const s=await get();return call(user,'/api/schedule/'+action,{month:'2026-11',revision:s.revision,availabilityRevision:s.availabilityRevision,...extra})};
 assert.equal((await call('AYU','/api/availability',{kind:'day',date:'2026-11-15'})).status,201);assert.equal((await call('AYU','/api/request',{date:'2026-11-08',location:'MOI',service:'IR 1'})).status,201);
 assert.equal((await act('EMEN','generate')).status,200);
 const blocked=await call('AYU','/api/availability',{kind:'day',date:'2026-11-22'});assert.equal(blocked.status,409);assert.equal(blocked.body.code,'SCHEDULE_MONTH_LOCKED');assert.equal(blocked.body.month,'2026-11');
 const id=db.prepare('SELECT id FROM availability').get().id;assert.equal((await call('AYU','/api/delete',{kind:'availability',id})).status,409);
 assert.equal((await call('AYU','/api/request',{date:'2026-11-29',location:'MOI',service:'IR 1'})).status,409);
 assert.equal((await call('AYU','/api/availability',{kind:'day',date:'2026-12-06'})).status,201);
 assert.throws(()=>db.prepare("INSERT INTO availability(member,kind,day,month,location,note,created) VALUES ('AYU','day','2026-11-29','','','',0)").run(),/SCHEDULE_MONTH_LOCKED/);
 assert.throws(()=>db.prepare("DELETE FROM requests WHERE member='AYU'").run(),/SCHEDULE_MONTH_LOCKED/);
 assert.equal((await call('AYU','/api/exchanges',{date:'2026-11-22',note:'Sudah sepakat bertukar dengan Evan; mohon Emen review.'})).status,201);
 assert.equal((await call('EMEN','/api/exchanges')).body.records.length,1);assert.equal((await call('BOWO','/api/exchanges')).body.records.length,0);
 await act('EMEN','submit');assert.equal((await call('AYU','/api/availability',{kind:'day',date:'2026-11-22'})).status,409);await act('EVAN','approve');assert.equal((await call('AYU','/api/availability',{kind:'day',date:'2026-11-22'})).status,409);
 const official=(await get()).published;await act('EMEN','revise');let pair,s=await get();outer:for(let a=0;a<s.draft.length;a++)for(let b=a+1;b<s.draft.length;b++){try{swapAssignments(s.draft,a,b,s.availability);pair={index:a,targetIndex:b};break outer}catch{}}
 assert.equal((await act('EMEN','swap',pair)).status,200);await act('EMEN','submit');assert.deepEqual((await get()).published,official);await act('EVAN','reject',{note:'Periksa kembali'});assert.deepEqual((await get()).published,official);await act('EMEN','submit');await act('EVAN','approve');assert.notDeepEqual((await get()).published,official);
 assert.equal(db.prepare("SELECT count(*) n FROM availability WHERE day='2026-11-15'").get().n,1);assert.equal(db.prepare("SELECT count(*) n FROM requests WHERE member='AYU'").get().n,1);db.close();
});
