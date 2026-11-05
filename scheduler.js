export const SERVICE_RULES = [
  {location:'Tamsir',service:'IR 1',start:510,end:600,roles:['SWITCHER','CAMERA 1','JIMMY JIB','CAMERA 3']},
  {location:'Tamsir',service:'IR 2',start:660,end:750,roles:['SWITCHER','CAMERA 1','JIMMY JIB']},
  {location:'Tamsir',service:'IR 3',start:1020,end:1110,roles:['SWITCHER','CAMERA 1','JIMMY JIB']},
  {location:'MOI',service:'IR 1',start:510,end:600,roles:['SWITCHER','CAMERA 1','CAMERA 2']},
  {location:'MOI',service:'IR 2',start:630,end:720,roles:['SWITCHER','CAMERA 1','CAMERA 2']},
  {location:'MOI',service:'IR 3',start:780,end:870,roles:['SWITCHER','CAMERA 1','CAMERA 2']},
  {location:'MOI',service:'IR 4',start:990,end:1080,roles:['SWITCHER','CAMERA 1','CAMERA 2']}
];
const ALL = ['SWITCHER','CAMERA 1','CAMERA 2','CAMERA 3','JIMMY JIB'];
export const MEMBER_ROLES = {
  EMEN:ALL, DEDY:ALL, AYU:ALL.filter(x=>x!=='JIMMY JIB'), BOWO:['CAMERA 1'],
  ANDRE:ALL, BILLY:ALL, OWEN:ALL.filter(x=>x!=='SWITCHER'), MELVERN:ALL,
  DAUD:ALL.filter(x=>x!=='SWITCHER'), EVAN:ALL, TIMI:ALL,
  EVELYN:['CAMERA 1','CAMERA 2'], AGUS:ALL, DEMAS:ALL.filter(x=>x!=='SWITCHER')
};
export const FAIR_MEMBERS = Object.keys(MEMBER_ROLES).filter(x=>MEMBER_ROLES[x].includes('SWITCHER'));
export const AMOUNT = {'SWITCHER':200000,'CAMERA 1':150000,'CAMERA 2':150000,'CAMERA 3':150000,'JIMMY JIB':150000};
const ROLE_ORDER = {'SWITCHER':0,'JIMMY JIB':1,'CAMERA 3':2,'CAMERA 2':3,'CAMERA 1':4};

export function sundays(month){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Bulan tidak valid.');
  const [year,number]=month.split('-').map(Number),days=[];
  for(let d=1;d<=new Date(Date.UTC(year,number,0)).getUTCDate();d++){
    const date=new Date(Date.UTC(year,number-1,d));
    if(date.getUTCDay()===0)days.push(date.toISOString().slice(0,10));
  }
  return days;
}
export function slotsForMonth(month){
  return sundays(month).flatMap(day=>SERVICE_RULES.flatMap(rule=>rule.roles.map(role=>({date:day,location:rule.location,service:rule.service,role,start:rule.start,end:rule.end,amount:AMOUNT[role],member:null}))));
}
export function isUnavailable(member,slot,availability){
  return availability.some(x=>x.member===member&&(
    x.kind==='day'&&x.day===slot.date ||
    x.kind==='month_off'&&x.month===slot.date.slice(0,7) ||
    x.kind==='month_morning'&&x.month===slot.date.slice(0,7)&&(
      !['IR 1','IR 2'].includes(slot.service)||x.location!=='Kedua lokasi'&&x.location!==slot.location
    )
  ));
}
export function dailyLocationChanges(member,slot,assignments){
  const day=[...assignments.filter(x=>x.member===member&&x.date===slot.date),slot]
    .sort((a,b)=>a.start-b.start);
  return day.reduce((count,current,index)=>count+(index>0&&current.location!==day[index-1].location?1:0),0);
}
export function canAssign(member,slot,assignments,availability){
  if(dailyLocationChanges(member,slot,assignments)>1)return false;
  if(!MEMBER_ROLES[member]?.includes(slot.role)||isUnavailable(member,slot,availability))return false;
  for(const other of assignments){
    if(other.member!==member||other.date!==slot.date)continue;
    if(slot.start<other.end&&other.start<slot.end)return false;
    if(slot.location!==other.location){
      if(slot.start>=other.end&&slot.start-other.end<60)return false;
      if(other.start>=slot.end&&other.start-slot.end<60)return false;
    }
  }
  return true;
}
function random(seed){let value=seed>>>0;return()=>{value=(1664525*value+1013904223)>>>0;return value/4294967296}}
function seedFor(month,trial){let value=trial+1;for(const c of month)value=(value*31+c.charCodeAt(0))>>>0;return value}
function requestMatches(member,slot,requests){return requests.some(x=>x.member===member&&x.day===slot.date&&x.location===slot.location&&x.service===slot.service)}
function totalFor(member,assignments){return assignments.reduce((sum,x)=>sum+(x.member===member?x.amount:0),0)}
export function summary(assignments,requests=[]){
  const totals=Object.fromEntries(Object.keys(MEMBER_ROLES).map(x=>[x,totalFor(x,assignments)]));
  const amounts=FAIR_MEMBERS.map(x=>totals[x]);
  const gap=Math.max(...amounts)-Math.min(...amounts);
  const missing=assignments.filter(x=>!x.member).length;
  const matched=assignments.filter(x=>x.member&&requestMatches(x.member,x,requests)).length;
  return {totals,gap,missing,matched,fairnessWithinTarget:gap<=200000};
}
export function validateAssignment(assignments,index,member,availability){
  const slot=assignments[index];
  if(!slot)throw new Error('Slot tidak ditemukan.');
  if(member!==null&&dailyLocationChanges(member,slot,assignments.filter((_,i)=>i!==index))>1)throw new Error('Anggota hanya boleh pindah lokasi satu kali pada tanggal ini.');
  if(member!==null&&(!MEMBER_ROLES[member]||!canAssign(member,slot,assignments.filter((_,i)=>i!==index),availability)))throw new Error('Anggota tidak tersedia, role tidak sesuai, atau jam bertabrakan.');
  return true;
}
export function generate(month,availability=[],requests=[]){
  const template=slotsForMonth(month);
  let best=null,bestScore=Infinity;
  for(let trial=0;trial<6;trial++){
    const rand=random(seedFor(month,trial));
    const assignments=template.map(x=>({...x}));
    const order=assignments.map((_,i)=>i).sort((a,b)=>{
      const x=assignments[a],y=assignments[b];
      return x.date.localeCompare(y.date)||ROLE_ORDER[x.role]-ROLE_ORDER[y.role]||x.start-y.start||x.location.localeCompare(y.location);
    });
    const totals=Object.fromEntries(Object.keys(MEMBER_ROLES).map(x=>[x,0]));
    const counts=Object.fromEntries(Object.keys(MEMBER_ROLES).map(x=>[x,0]));
    const dayAssignments=new Map();
    for(const index of order){
      const slot=assignments[index];
      const onDay=dayAssignments.get(slot.date)||[];
      let choice=null,lowest=Infinity;
      for(const member of Object.keys(MEMBER_ROLES)){
        if(!canAssign(member,slot,onDay,availability))continue;
        const eligible=FAIR_MEMBERS.includes(member);
        const sameDay=onDay.filter(x=>x.member===member).length;
        const preference=requestMatches(member,slot,requests)?-450:0;
        const score=(eligible?totals[member]/1000:counts[member]*80)+sameDay*95+preference+rand()*270;
        if(score<lowest){lowest=score;choice=member}
      }
      if(choice){slot.member=choice;totals[choice]+=slot.amount;counts[choice]++;onDay.push(slot);dayAssignments.set(slot.date,onDay)}
    }
    const report=summary(assignments,requests);
    const score=report.missing*10000000+report.gap/1000*8-report.matched*70;
    if(score<bestScore){bestScore=score;best={slots:assignments,summary:report}}
    if(report.missing===0&&report.fairnessWithinTarget&&trial>=5)break;
  }
  return best;
}
