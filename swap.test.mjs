import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {slotsForMonth,canAssign} from './scheduler.js';
import {swapAssignments} from './schedule-view.js';
import {d1,migrate,seed,client} from './test-support.mjs';

function fixture(){
 const slots=slotsForMonth('2026-11');
 const index=(location,service,role='SWITCHER',date='2026-11-01')=>slots.findIndex(s=>s.location===location&&s.service===service&&s.role===role&&s.date===date);
 const a=index('MOI','IR 1'),b=index('Tamsir','IR 1');slots[a].member='EVAN';slots[b].member='EMEN';
 return {slots,index,a,b};
}
test('same-time MOI/Tamsir swap succeeds without temporarily emptying either slot',()=>{
 const {slots,a,b}=fixture(),before=structuredClone(slots);
 assert.equal(canAssign('EMEN',slots[a],slots.filter((_,i)=>i!==a),[]),false);
 const after=swapAssignments(slots,a,b);assert.equal(after[a].member,'EMEN');assert.equal(after[b].member,'EVAN');assert.deepEqual(slots,before);
 assert.deepEqual(swapAssignments(after,a,b),before);
 assert.deepEqual(after.map(({member,...s})=>s),before.map(({member,...s})=>s));
});
test('rejects invalid slots, same member, unfilled slot and role mismatch without mutation',()=>{
 const {slots,a,b,index}=fixture();for(const pair of [[a,a],[-1,b],[a,999],['1',b],[1.5,b],[a,index('MOI','IR 2')]])assert.throws(()=>swapAssignments(slots,...pair));
 slots[b].member='EVAN';assert.throws(()=>swapAssignments(slots,a,b),/anggota yang sama/);
 slots[b].member='EMEN';slots[a].member=null;const c=index('MOI','IR 1','CAMERA 1');slots[c].member='BOWO';const before=structuredClone(slots);assert.throws(()=>swapAssignments(slots,c,b),/BOWO.*Role/);assert.deepEqual(slots,before);
});
test('checks both members availability and other duties, including transfer count and travel gap',()=>{
 const {slots,a,b,index}=fixture();
 for(const member of ['EMEN','EVAN'])assert.throws(()=>swapAssignments(slots,a,b,[{member,kind:'day',day:'2026-11-01'}]),/Izin/);
 // Evan is initially MOI IR1 + IR2. Moving to Tamsir IR1 would leave only 30 minutes to MOI IR2.
 slots[index('MOI','IR 2')].member='EVAN';assert.throws(()=>swapAssignments(slots,a,b),/60 menit/);slots[index('MOI','IR 2')].member=null;
 // Evan starts MOI IR1 -> MOI IR3 -> Tamsir IR3. After swap: Tamsir -> MOI -> Tamsir.
 slots[index('MOI','IR 3')].member='EVAN';slots[index('Tamsir','IR 3')].member='EVAN';assert.throws(()=>swapAssignments(slots,a,b),/satu kali/);
});
test('cross-date and different-role swaps keep slot tariffs and validate both dates',()=>{
 const {slots,a,index}=fixture();const target=index('Tamsir','IR 1','CAMERA 1','2026-11-08');slots[target].member='DEDY';
 const after=swapAssignments(slots,a,target);assert.equal(after[a].amount,200000);assert.equal(after[target].amount,150000);
 assert.throws(()=>swapAssignments(slots,a,target,[{member:'EVAN',kind:'day',day:'2026-11-08'}]),/Izin/);
});
test('API swap is one audited write, supports undo, protects permissions, versions and published schedule',async()=>{
 const db=new DatabaseSync(':memory:');migrate(db);seed(db,'SwapIntegration!2026');const call=client({DB:d1(db)}),{slots,a,b,index}=fixture(),month='2026-11';
 try{
  const serialized=JSON.stringify(slots);db.prepare("INSERT INTO schedules(month,draft_json,published_json,status,revision,updated_by,action) VALUES (?,?,?,'draft',1,'EMEN','generate')").run(month,serialized,serialized);
  for(const u of ['EMEN','EVAN','DEDY'])assert.equal((await call(u,'/api/login',{username:u,password:'SwapIntegration!2026'})).status,200);
  const get=async()=>(await call('EMEN','/api/schedule?month='+month)).body;
  const swap=async(user='EMEN',overrides={})=>call(user,'/api/schedule/swap',{month,index:a,targetIndex:b,revision:1,availabilityRevision:0,...overrides});
  assert.equal((await swap('EVAN')).status,403);assert.equal((await swap('DEDY')).status,403);
  const before=await get();assert.equal((await swap('EMEN',{targetIndex:index('MOI','IR 2')})).status,409);assert.equal((await get()).revision,1);
  assert.equal((await swap()).status,200);let after=await get();assert.equal(after.revision,2);assert.equal(after.draft[a].member,'EMEN');assert.equal(after.draft[b].member,'EVAN');assert.deepEqual(after.published,before.published);assert.equal(after.history[0].action,'swap');
  const audit=db.prepare('SELECT * FROM schedule_history WHERE revision=2').get();assert.deepEqual(JSON.parse(audit.before_json).draft,slots);assert.deepEqual(JSON.parse(audit.after_json).draft,after.draft);
  assert.equal((await swap()).status,409);assert.equal((await get()).revision,2);
  assert.equal((await swap('EMEN',{revision:2})).status,200);assert.deepEqual((await get()).draft,slots);
  await call('DEDY','/api/availability',{kind:'day',date:'2026-12-02'});assert.equal((await swap('EMEN',{revision:3})).status,409);assert.equal((await get()).revision,3);
  db.prepare("UPDATE schedules SET status='pending',revision=revision+1 WHERE month=?").run(month);assert.equal((await swap('EMEN',{revision:4,availabilityRevision:1})).status,409);
 }finally{db.close()}
});
