import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';import {readFileSync,readdirSync} from 'node:fs';
import {d1,migrate,seed,client} from './test-support.mjs';
import {isUnavailable,generate,canAssign,slotsForMonth} from './scheduler.js';
import {swapAssignments} from './schedule-view.js';
import {normalizedServices,selectedServices} from './availability.js';
const selection=[...['IR 1','IR 2','IR 3'].map(service=>({location:'MOI',service})),...['IR 1','IR 2'].map(service=>({location:'Tamsir',service}))];
test('monthly multi-location service whitelist is enforced in generate, assign, swap and dates',()=>{
 const rule={member:'EMEN',kind:'month_services',month:'2026-11',services_json:JSON.stringify(selection)},slots=slotsForMonth('2026-11');
 for(const slot of slots)assert.equal(isUnavailable('EMEN',slot,[rule]),!selection.some(s=>s.location===slot.location&&s.service===slot.service));
 const result=generate('2026-11',[rule]);assert.ok(result.slots.some(s=>s.member==='EMEN'));for(const s of result.slots.filter(s=>s.member==='EMEN'))assert.ok(selection.some(x=>x.location===s.location&&x.service===s.service));
 const late=slots.findIndex(s=>s.location==='MOI'&&s.service==='IR 4'&&s.role==='SWITCHER'),early=slots.findIndex(s=>s.location==='Tamsir'&&s.service==='IR 1'&&s.role==='SWITCHER');slots[early].member='EMEN';slots[late].member='EVAN';assert.equal(canAssign('EMEN',slots[late],[],[rule]),false);assert.throws(()=>swapAssignments(slots,early,late,[rule]),/Izin/);
 assert.equal(isUnavailable('EMEN',{...slots[late],date:'2026-12-06'},[rule]),false);
 assert.equal(isUnavailable('EMEN',slots[early],[rule,{member:'EMEN',kind:'day',day:slots[early].date}]),true);
 assert.throws(()=>normalizedServices([]));assert.throws(()=>normalizedServices([{location:'Tamsir',service:'IR 4'}]));assert.equal(normalizedServices([selection[0],selection[0]]).length,1);
});
test('migration preserves all day records and effective legacy morning restrictions',()=>{
 const db=new DatabaseSync(':memory:');try{
 for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')&&!f.startsWith('0005')).sort())db.exec(readFileSync('migrations/'+f,'utf8'));
 const insert=db.prepare('INSERT INTO availability(member,kind,day,month,location,note,created) VALUES (?,?,?,?,?,?,?)');
 insert.run('AYU','day','2026-11-15','','','',1);insert.run('AYU','day','2026-11-22','','','',2);
 for(const [member,location] of [['EMEN','Kedua lokasi'],['DEDY','MOI'],['EVAN','MOI'],['EVAN','Tamsir']])insert.run(member,'month_morning','','2026-11',location,'legacy',1);
 const before=db.prepare('SELECT * FROM availability').all();db.exec(readFileSync('migrations/0005_service_availability.sql','utf8'));const after=db.prepare('SELECT * FROM availability').all();assert.equal(after.filter(x=>x.member==='AYU').length,2);assert.equal(after.filter(x=>x.kind==='month_morning').length,0);
 for(const member of ['EMEN','DEDY','EVAN'])for(const s of slotsForMonth('2026-11'))assert.equal(isUnavailable(member,s,after),isUnavailable(member,s,before));
 assert.equal(selectedServices(after.find(x=>x.member==='EMEN')).length,4);assert.equal(selectedServices(after.find(x=>x.member==='DEDY')).length,2);
 }finally{db.close()}
});
test('API retains both Ayu leave dates and preferences; saves/edits one rule across two locations',async()=>{
 const db=new DatabaseSync(':memory:');migrate(db);seed(db,'Availability!2026');const call=client({DB:d1(db)});try{
 for(const username of ['AYU','EMEN','EVAN'])assert.equal((await call(username,'/api/login',{username,password:'Availability!2026'})).status,200);
 for(const date of ['2026-11-15','2026-11-22'])assert.equal((await call('AYU','/api/availability',{kind:'day',date})).status,201);
 assert.equal((await call('AYU','/api/availability',{kind:'day',date:'2026-11-15'})).status,409);
 for(const date of ['2026-11-08','2026-11-29'])assert.equal((await call('AYU','/api/request',{date,location:'MOI',service:'IR 1'})).status,201);
 const get=async user=>(await call(user,'/api/schedule?month=2026-11')).body;
 for(const manager of ['EMEN','EVAN']){const s=await get(manager);assert.deepEqual(s.availability.map(x=>x.day).sort(),['2026-11-15','2026-11-22']);assert.equal(s.requests.length,2)}assert.equal((await get('AYU')).availability,undefined);
 const payload={kind:'month_services',month:'2026-11',services:selection};assert.equal((await call('EMEN','/api/availability',payload)).status,201);assert.equal((await call('EMEN','/api/availability',payload)).status,409);
 let leaves=(await call('EMEN','/api/state')).body.leaves;assert.equal(leaves.length,1);assert.equal(selectedServices(leaves[0]).length,5);const id=leaves[0].id;
 assert.equal((await call('AYU','/api/availability',{...payload,id})).status,404);
 assert.equal((await call('EMEN','/api/request',{date:'2026-11-08',location:'MOI',service:'IR 4'})).status,409);
 assert.equal((await call('EMEN','/api/availability',{...payload,id,services:[selection[0]]})).status,201);leaves=(await call('EMEN','/api/state')).body.leaves;assert.equal(leaves.length,1);assert.equal(selectedServices(leaves[0]).length,1);
 let s=await get('EMEN');assert.equal((await call('EMEN','/api/schedule/generate',{month:'2026-11',revision:s.revision,availabilityRevision:s.availabilityRevision})).status,200);s=await get('EMEN');assert.ok(s.draft.filter(x=>x.member==='EMEN').every(x=>x.location==='MOI'&&x.service==='IR 1'));assert.ok(s.draft.every(x=>x.member!=='AYU'||!['2026-11-15','2026-11-22'].includes(x.date)));
 // Changing allowed services flags the draft and prevents approval of stale availability.
 assert.equal((await call('EMEN','/api/availability',{...payload,id,services:[{location:'Tamsir',service:'IR 3'}]})).status,201);const changed=await get('EMEN');assert.ok(changed.issues.some(x=>x.reason.includes('Izin')));assert.equal((await call('EMEN','/api/schedule/submit',{month:'2026-11',revision:s.revision,availabilityRevision:s.availabilityRevision})).status,409);
 }finally{db.close()}
});
