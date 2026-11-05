import test from 'node:test';
import assert from 'node:assert/strict';
import {generate, slotsForMonth, canAssign, validateAssignment, MEMBER_ROLES, FAIR_MEMBERS} from './scheduler.js';

test('November 2026 creates the fixed 22 slots on each of five Sundays',()=>{
  const slots=slotsForMonth('2026-11');
  assert.equal(slots.length,110);
  assert.equal(slots.filter(x=>x.date==='2026-11-01').length,22);
  assert.equal(slots.filter(x=>x.location==='Tamsir'&&x.service==='IR 1'&&x.date==='2026-11-01').length,4);
});

test('cross-location travel rule uses a minimum 60-minute gap',()=>{
  const slots=slotsForMonth('2026-11');
  const moi1=slots.find(x=>x.date==='2026-11-01'&&x.location==='MOI'&&x.service==='IR 1'&&x.role==='SWITCHER');moi1.member='EMEN';
  const tamsir2=slots.find(x=>x.date==='2026-11-01'&&x.location==='Tamsir'&&x.service==='IR 2'&&x.role==='SWITCHER');
  assert.equal(canAssign('EMEN',tamsir2,[moi1],[]),true);
  const tamsir1=slots.find(x=>x.date==='2026-11-01'&&x.location==='Tamsir'&&x.service==='IR 1'&&x.role==='SWITCHER');tamsir1.member='EMEN';
  const moi2=slots.find(x=>x.date==='2026-11-01'&&x.location==='MOI'&&x.service==='IR 2'&&x.role==='SWITCHER');
  assert.equal(canAssign('EMEN',moi2,[tamsir1],[]),false);
});

test('role and availability restrictions remain hard constraints',()=>{
  const slot=slotsForMonth('2026-11').find(x=>x.location==='MOI'&&x.service==='IR 3'&&x.role==='SWITCHER');
  assert.equal(canAssign('BOWO',slot,[],[]),false);
  assert.equal(canAssign('EMEN',slot,[],[{member:'EMEN',kind:'month_morning',month:'2026-11',location:'MOI'}]),false);
  assert.equal(canAssign('EMEN',slot,[],[{member:'EMEN',kind:'day',day:slot.date}]),false);
  assert.equal(MEMBER_ROLES.DEMAS.includes('SWITCHER'),false);
});

test('baseline generator fills every slot and balances Switcher-capable members within Rp200,000',()=>{
  const result=generate('2026-11');
  assert.equal(result.summary.missing,0);
  assert.ok(result.summary.gap<=200000);
  for(const [index,slot] of result.slots.entries()){
    assert.equal(canAssign(slot.member,slot,result.slots.filter((_,i)=>i!==index),[]),true);
  }
  assert.equal(FAIR_MEMBERS.length,9);
});

test('infeasible month reports empty slots instead of violating leave',()=>{
  const leave=Object.keys(MEMBER_ROLES).map(member=>({member,kind:'month_off',month:'2026-11'}));
  const result=generate('2026-11',leave);
  assert.equal(result.summary.missing,110);
});

const serviceSlot=(location,service,date='2026-11-01')=>({...slotsForMonth('2026-11').find(s=>s.date===date&&s.location===location&&s.service===service&&s.role==='SWITCHER'),member:'EMEN'});

test('rejects return trips in both directions regardless of insertion order',()=>{
  const routes=[
    [serviceSlot('MOI','IR 1'),serviceSlot('Tamsir','IR 2'),serviceSlot('MOI','IR 4')],
    [serviceSlot('Tamsir','IR 1'),serviceSlot('MOI','IR 3'),serviceSlot('Tamsir','IR 3')]
  ];
  for(const route of routes){
    for(let i=0;i<route.length;i++){
      assert.equal(canAssign('EMEN',route[i],route.filter((_,j)=>i!==j).reverse(),[]),false);
      assert.throws(()=>validateAssignment(route,i,'EMEN',[]),/pindah lokasi satu kali/);
    }
  }
});

test('allows one transfer, same-location full days, and independent dates and members',()=>{
  const routes=[
    [serviceSlot('MOI','IR 1'),serviceSlot('Tamsir','IR 2'),serviceSlot('Tamsir','IR 3')],
    [serviceSlot('Tamsir','IR 1'),serviceSlot('MOI','IR 3'),serviceSlot('MOI','IR 4')],
    [1,2,3,4].map(i=>serviceSlot('MOI','IR '+i)),
    [1,2,3].map(i=>serviceSlot('Tamsir','IR '+i))
  ];
  for(const route of routes)for(let i=0;i<route.length;i++)assert.equal(canAssign('EMEN',route[i],route.filter((_,j)=>i!==j),[]),true);
  const candidate=serviceSlot('MOI','IR 4');
  assert.equal(canAssign('EMEN',candidate,[serviceSlot('MOI','IR 1'),serviceSlot('Tamsir','IR 2','2026-11-08'),{...serviceSlot('Tamsir','IR 2'),member:'DEDY'}],[]),true);
  assert.equal(validateAssignment(routes[0],1,null,[]),true);
});

test('generated schedules have at most one chronological location change per member per date',()=>{
  for(const month of ['2026-11','2026-12','2027-01']){
    const {slots}=generate(month);
    for(const member of Object.keys(MEMBER_ROLES)){
      for(const date of new Set(slots.map(s=>s.date))){
        const day=slots.filter(s=>s.member===member&&s.date===date).sort((a,b)=>a.start-b.start);
        assert.ok(day.filter((s,i)=>i>0&&s.location!==day[i-1].location).length<=1,member+' '+date);
      }
    }
  }
});
