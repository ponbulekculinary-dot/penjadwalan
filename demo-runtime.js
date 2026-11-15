// Browser-only demo. No fetch, cookies, localStorage, or live database access.
// build.mjs bundles the same scheduler used by the live Worker above this code.
const demoMembers = Object.keys(MEMBER_ROLES);
const demo = {user: null, leaves: [], requests: [], cash: {}, passwords: {}, schedules: {}, availabilityRevision: 0, nextId: 1};
function demoFail(status, message) { const error = new Error(message); error.status = status; throw error; }
function demoMonth() { return new Date().toLocaleDateString('sv-SE', {timeZone:'Asia/Jakarta'}).slice(0,7); }
function demoDay(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)); }
function demoValidMonth(value) { return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
function demoUnavailable(member, day, location, service, entries = demo.leaves) {
  return isUnavailable(member, {date:day, location, service}, entries);
}
function demoComplete(slots) {
  if (slots.some(x=>!x.member)) demoFail(409, 'Masih ada slot kosong. Lengkapi sebelum ajukan jadwal.');
  for (const [index, slot] of slots.entries()) {
    try { validateAssignment(slots,index,slot.member,demo.leaves); }
    catch { demoFail(409, 'Ada jadwal yang bertentangan dengan izin atau jam terbaru. Revisi draft dahulu.'); }
  }
}
window.FrameDemo = {
  async request(path, data) {
    await new Promise(resolve=>setTimeout(resolve,80));
    const url = new URL(path, 'https://frame.demo');
    const route = url.pathname;
    if (route === '/api/health') return {service:'frame-kamera',ready:true};
    if (route === '/api/login') {
      const name = String(data.username||'').trim().toUpperCase();
      if (!demoMembers.includes(name) || data.password !== (demo.passwords[name]||'Password123')) demoFail(401, 'Username atau password demo belum sesuai.');
      demo.user=name;
      return {user:name};
    }
    const member=demo.user;
    if (!member) demoFail(401,'Silakan login.');
    demo.inactive??=[];
    if(route==='/api/generation-members'){
      if(member!=='EMEN')demoFail(403,'Hanya Emen.');
      if(data&&Object.hasOwn(data,'active')){if(!demoMembers.includes(data.member)||typeof data.active!=='boolean')demoFail(400,'Pilihan anggota tidak valid.');demo.inactive=demo.inactive.filter(n=>n!==data.member);if(!data.active)demo.inactive.push(data.member);return {ok:true};}
      return {members:demoMembers.map(name=>({name,schedule_active:demo.inactive.includes(name)?0:1}))};
    }
    const lockedMonths=Object.keys(demo.schedules).filter(month=>demo.schedules[month]?.draft||demo.schedules[month]?.published);
    demo.exchanges??=[];
    if(route==='/api/leave-dates'){
      if(!Array.isArray(data.dates)||!data.dates.length||data.dates.length>31||data.dates.some(x=>!demoDay(x)))demoFail(400,'Pilih tanggal valid.');
      const locked=data.dates.filter(x=>lockedMonths.includes(x.slice(0,7)));if(locked.length)demoFail(409,'Jadwal Sudah Dibuat: '+locked[0].slice(0,7));
      for(const day of data.dates)if(demo.leaves.some(x=>x.member===member&&x.day===day&&x.kind==='day')||demo.requests.some(x=>x.member===member&&x.day===day))demoFail(409,'Tanggal sudah tercatat atau memiliki preferensi.');
      for(const day of [...new Set(data.dates)])demo.leaves.push({id:Math.max(0,...demo.leaves.map(x=>x.id))+1,member,kind:'day',day,month:'',location:'',note:String(data.note||'').slice(0,500),created:Date.now()});demo.availabilityRevision++;return {ok:true};
    }
    if(route==='/api/exchanges'){
      if(data&&Object.hasOwn(data,'date')){if(!demoDay(data.date)||typeof data.note!=='string'||!data.note.trim()||data.note.length>500)demoFail(400,'Isi tanggal dan rincian pertukaran.');demo.exchanges.push({id:Date.now(),member,day:data.date,note:data.note.trim(),created:Date.now()});return {ok:true};}
      return structuredClone({lockedMonths,records:demo.exchanges.filter(x=>['EMEN','EVAN'].includes(member)||x.member===member)});
    }
    if(['/api/availability','/api/request','/api/delete'].includes(route)){
      let periods=[data?.kind&&data.kind!=='day'?data.month:data?.date?.slice(0,7)];if(route==='/api/availability'&&data.id){const old=demo.leaves.find(x=>x.id===data.id&&x.member===member);if(old)periods.push(old.month||old.day?.slice(0,7))}
      if(route==='/api/delete'){const rows=data.kind==='availability'?demo.leaves:demo.requests;const entry=rows.find(x=>x.id===data.id&&x.member===member);if(entry)periods.push(entry.month||entry.day?.slice(0,7));}
      const locked=periods.find(x=>lockedMonths.includes(x));if(locked)demoFail(409,'Jadwal Sudah Dibuat: '+locked);
    }
    if(route==='/api/dues'){
      demo.dues??=[];
      if(data&&Object.hasOwn(data,'periods')){
        if(member!=='BOWO')demoFail(403,'Hanya Bowo yang dapat mengubah kas.');
        if(!demoMembers.includes(data.member)||!Array.isArray(data.periods)||data.periods.some(p=>!/^20\d{2}-(0[1-9]|1[0-2])$/.test(p)))demoFail(400,'Periode tidak valid.');
        demo.dues=demo.dues.filter(x=>x.member!==data.member).concat([...new Set(data.periods)].map(month=>({member:data.member,month,status:'unpaid',updated_at:Date.now()})));return {ok:true};
      }
      return structuredClone({members:member==='BOWO'?demoMembers:[member],records:demo.dues.filter(x=>member==='BOWO'||x.member===member)});
    }
    if (route === '/api/state') {
      const cash=demo.cash[demoMonth()]||{};
      return structuredClone({user:member,leaves:demo.leaves.filter(x=>x.member===member),requests:demo.requests.filter(x=>x.member===member),cash:member==='BOWO'?cash:cash[member]?{[member]:cash[member]}:{},month:demoMonth()});
    }
    if (route === '/api/logout') { demo.user=null;return {ok:true}; }
    if (route === '/api/password') {
      if (data.current !== (demo.passwords[member]||'Password123')) demoFail(400,'Password demo saat ini tidak sesuai.');
      if (data.next.length<8||data.current===data.next) demoFail(400,'Password baru harus berbeda dan minimal 8 karakter.');
      demo.passwords[member]=data.next;return {ok:true};
    }
    if (route === '/api/cash') {
      if (member!=='BOWO') demoFail(403,'Hanya Bowo yang bisa mengubah status kas.');
      if (!demoMembers.includes(data.member)||!['paid','unpaid'].includes(data.status)) demoFail(400,'Status kas tidak valid.');
      demo.cash[demoMonth()]??={};demo.cash[demoMonth()][data.member]=data.status;return {ok:true};
    }
    if (route === '/api/availability') {
      let {kind}=data;
      if (!['day','month_off','month_morning','month_services'].includes(kind)||kind==='day'&&!demoDay(data.date)||kind!=='day'&&!demoValidMonth(data.month)||kind==='month_morning'&&!['Kedua lokasi','Tamsir','MOI'].includes(data.location)) demoFail(400,'Ketersediaan tidak valid.');
      if(kind==='month_morning'){data.services=selectedServices({kind,location:data.location});kind='month_services';}
      const existing=data.id===undefined?null:demo.leaves.find(x=>x.id===data.id&&x.member===member);
      if(data.id!==undefined&&!existing)demoFail(404,'Pengajuan tidak ditemukan.');
      if(existing&&(kind!=='month_services'||existing.kind!=='month_services'||existing.month!==data.month))demoFail(400,'Ubah pilihan ibadah pada bulan yang sama.');
      let services=[];if(kind==='month_services'){try{services=normalizedServices(data.services)}catch(error){demoFail(400,error.message)}}
      if(kind==='month_services'&&demo.leaves.some(x=>x.member===member&&x.month===data.month&&x.kind==='month_off'))demoFail(409,'Bulan ini sudah OFF. Hapus aturan OFF terlebih dahulu.');
      const entry={services_json:JSON.stringify(services),id:existing?.id||demo.nextId++,member,kind,day:kind==='day'?data.date:'',month:kind==='day'?'':data.month,location:kind==='month_morning'?data.location:'',note:data.note||'',created:Date.now()};
      if (demo.leaves.some(x=>x.id!==data.id&&x.member===member&&x.kind===kind&&x.day===entry.day&&x.month===entry.month&&x.location===entry.location)) demoFail(409,'Aturan ini sudah dicatat.');
      if (demo.requests.some(x=>x.member===member&&demoUnavailable(member,x.day,x.location,x.service,[entry]))) demoFail(409,'Ada special request yang bertentangan. Hapus request itu terlebih dahulu.');
      const published=demo.schedules[kind==='day'?data.date.slice(0,7):data.month]?.published;
      if (published?.some(x=>x.member===member&&isUnavailable(member,x,[entry]))) demoFail(409,'Jadwal tanggal ini sudah terbit. Hubungi Emen untuk perubahan tugas.');
      demo.availabilityRevision++;if(existing)demo.leaves=demo.leaves.map(x=>x.id===existing.id?entry:x);else demo.leaves.push(entry);return {ok:true};
    }
    if (route === '/api/request') {
      if (!demoDay(data.date)||!SERVICE_RULES.some(x=>x.location===data.location&&x.service===data.service)) demoFail(400,'Tanggal atau ibadah tidak valid.');
      if (demoUnavailable(member,data.date,data.location,data.service)) demoFail(409,'Pilihan ini bertentangan dengan ketersediaan yang kamu catat.');
      if (demo.requests.some(x=>x.member===member&&x.day===data.date&&x.location===data.location&&x.service===data.service)) demoFail(409,'Request yang sama sudah diajukan.');
      demo.requests.push({id:demo.nextId++,member,day:data.date,location:data.location,service:data.service,note:data.note||'',created:Date.now()});return {ok:true};
    }
    if (route === '/api/delete') {
      const key=data.kind==='availability'?'leaves':data.kind==='request'?'requests':null;
      if (!key) demoFail(400,'Data hapus tidak valid.');
      if (!demo[key].some(x=>x.id===data.id&&x.member===member)) demoFail(404,'Data tidak ditemukan.');
      if(key==='leaves')demo.availabilityRevision++;demo[key]=demo[key].filter(x=>x.id!==data.id||x.member!==member);return {ok:true};
    }
    const month=data?.month||url.searchParams.get('month')||demoMonth();
    if (!demoValidMonth(month)) demoFail(400,'Bulan tidak valid.');
    const record=demo.schedules[month];
    if (route === '/api/schedule') return structuredClone({month,...scheduleView(record,member,demo.leaves.filter(x=>x.day.startsWith(month)||x.month===month),demo.requests.filter(x=>x.day.startsWith(month)),record?.history||[],demo.availabilityRevision)});
    if (route.startsWith('/api/schedule/')) {
      if(!Number.isInteger(data.revision)||data.revision!==(record?.revision||0)||data.availabilityRevision!==demo.availabilityRevision)demoFail(409,'Jadwal atau ketersediaan berubah. Muat ulang sebelum melanjutkan.');
    }
    const track=record=>{record.revision=(record.revision||0)+1;(record.history??=[]).unshift({revision:record.revision,actor:member,action:route.split('/').pop(),created:Date.now()});};
    if(route==='/api/schedule/revise'){if(member!=='EMEN')demoFail(403,'Hanya Emen yang boleh membuat revisi.');if(record?.status!=='published')demoFail(409,'Jadwal belum terbit.');record.draft=structuredClone(record.published);record.status='draft';record.approvalNote=null;track(record);return {status:'draft',revision:record.revision};}
    if (route === '/api/schedule/generate') {
      if (member!=='EMEN') demoFail(403,'Hanya Emen yang bisa generate jadwal.');
      if (record?.status==='pending') demoFail(409,'Jadwal sedang menunggu keputusan Evan.');
      const result=generate(month,[...demo.leaves,...demo.inactive.map(member=>({member,kind:'month_off',month}))],demo.requests);
      demo.schedules[month]={...record,draft:result.slots,status:'draft',approvalNote:null};track(demo.schedules[month]);return structuredClone(result);
    }
    if (!record?.draft) demoFail(404,'Buat draft jadwal dulu.');
    if (route === '/api/schedule/assign') {
      if (member!=='EMEN') demoFail(403,'Hanya Emen yang bisa mengubah draft.');
      if (record.status!=='draft') demoFail(409,'Draft sedang menunggu approval Evan.');
      try { validateAssignment(record.draft,data.index,data.member,demo.leaves); } catch(error){ demoFail(409,error.message); }
      record.draft[data.index].member=data.member;track(record);return {ok:true,revision:record.revision};
    }
    if(route==='/api/schedule/rotate'){
      if(member!=='EMEN')demoFail(403,'Hanya Emen.');
      if(record.status!=='draft'||record.revision!==data.revision||data.availabilityRevision!==demo.availabilityRevision)demoFail(409,'Draft berubah atau terkunci.');
      try{record.draft=rotateAssignments(record.draft,data.indices,demo.leaves)}catch(error){demoFail(409,error.message)}track(record);return {ok:true,revision:record.revision};
    }
    if (route === '/api/schedule/swap') {
      if(member!=='EMEN')demoFail(403,'Hanya Emen yang bisa menukar tugas.');
      if(record.status!=='draft')demoFail(409,'Draft sedang terkunci untuk review.');
      try {const next=swapAssignments(record.draft,data.index,data.targetIndex,demo.leaves);record.draft=next;} catch(error){demoFail(409,error.message);}
      track(record);return {ok:true,revision:record.revision};
    }
    if (route === '/api/schedule/submit') {
      if (member!=='EMEN') demoFail(403,'Hanya Emen yang bisa mengajukan jadwal.');
      if (record.status!=='draft') demoFail(409,'Jadwal sudah diajukan.');
      demoComplete(record.draft);record.status='pending';record.approvalNote=null;track(record);return {status:'pending'};
    }
    if (['/api/schedule/approve','/api/schedule/reject'].includes(route)) {
      if (member!=='EVAN') demoFail(403,'Hanya Evan yang bisa memberi keputusan jadwal.');
      if (record.status!=='pending') demoFail(409,'Tidak ada jadwal yang menunggu approval.');
      if (route.endsWith('/reject')) {if(!String(data.note||'').trim())demoFail(400,'Isi catatan revisi.');record.status='draft';record.approvalNote=data.note||'Perlu revisi dari Evan.';track(record);return {status:'draft'};}
      demoComplete(record.draft);record.published=structuredClone(record.draft);record.publishedAt=Date.now();record.status='published';record.approvalNote=null;track(record);return {status:'published'};
    }
    demoFail(404,'Endpoint demo tidak ditemukan.');
  }
};
