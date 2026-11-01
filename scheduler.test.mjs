import test from 'node:test';
import assert from 'node:assert/strict';
import {generate, slotsForMonth, canAssign, MEMBER_ROLES, FAIR_MEMBERS} from './scheduler.js';

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
