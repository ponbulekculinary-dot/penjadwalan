import {MEMBER_ROLES, summary, dailyLocationChanges, isUnavailable} from './scheduler.js';

export function assignmentReason(member, slot, slots, availability, index) {
  if (!MEMBER_ROLES[member]?.includes(slot.role)) return 'Role tidak sesuai';
  if (isUnavailable(member,slot,availability)) return 'Izin atau batasan ketersediaan';
  const others=slots.filter((s,i)=>i!==index&&s.member===member&&s.date===slot.date);
  if (others.some(s=>s.start<slot.end&&slot.start<s.end)) return 'Jam ibadah bertabrakan';
  if (others.some(s=>s.location!==slot.location && (slot.start>=s.end?slot.start-s.end:s.start-slot.end)<60)) return 'Jeda pindah lokasi kurang dari 60 menit';
  if (dailyLocationChanges(member,slot,others)>1) return 'Maksimal satu kali pindah lokasi per hari';
  return '';
}
export function scheduleView(record,member,availability=[],requests=[],history=[],availabilityRevision=0) {
  const manager=['EMEN','EVAN'].includes(member),draft=record?.draft||null,published=record?.published||null;
  const own=published?.filter(s=>s.member===member)||[];
  const keys=new Set(own.map(s=>[s.date,s.location,s.service].join('|')));
  const clean=s=>({date:s.date,location:s.location,service:s.service,start:s.start,end:s.end,role:s.role,member:s.member});
  const totals=published?summary(published).totals:null;
  const report=manager&&draft?summary(draft,requests):null;
  const issues=manager&&draft?draft.flatMap((s,i)=>{const reason=s.member?assignmentReason(s.member,s,draft,availability,i):'Slot kosong';return reason?[{index:i,reason}]:[]}):[];
  return {
    status:manager?record?.status||null:published?'published':null,
    revision:manager?record?.revision||0:undefined, availabilityRevision:manager?availabilityRevision:undefined,
    approvalNote:manager?record?.approvalNote||null:null,
    draft:manager?draft:null,draftSummary:report,
    published:manager?published:published?own.map(clean):null,
    teammates:manager?[]:published?.filter(s=>keys.has([s.date,s.location,s.service].join('|'))).map(clean)||[],
    counts:published?Object.fromEntries(Object.keys(MEMBER_ROLES).map(n=>[n,published.filter(s=>s.member===n).length])):null,
    ownPK:totals?.[member]??null,totals:manager?totals:null,publishedAt:record?.publishedAt||null,
    issues:manager?issues:undefined,
    candidates:member==='EMEN'&&draft?draft.map((s,i)=>Object.keys(MEMBER_ROLES).map(name=>({name,reason:assignmentReason(name,s,draft,availability,i)}))):undefined,
    availability:manager?availability:undefined, requests:manager?requests:undefined,
    history:manager?history:undefined
  };
}
