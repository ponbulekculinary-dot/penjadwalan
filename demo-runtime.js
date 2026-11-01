// Browser-only demo. No fetch, cookies, localStorage, or live database access.
// build.mjs bundles the same scheduler used by the live Worker above this code.
const demoMembers = Object.keys(MEMBER_ROLES);
const demo = {user: null, leaves: [], requests: [], cash: {}, passwords: {}, schedules: {}, nextId: 1};
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
      const {kind}=data;
      if (!['day','month_off','month_morning'].includes(kind)||kind==='day'&&!demoDay(data.date)||kind!=='day'&&!demoValidMonth(data.month)||kind==='month_morning'&&!['Kedua lokasi','Tamsir','MOI'].includes(data.location)) demoFail(400,'Ketersediaan tidak valid.');
      const entry={id:demo.nextId++,member,kind,day:kind==='day'?data.date:'',month:kind==='day'?'':data.month,location:kind==='month_morning'?data.location:'',note:data.note||'',created:Date.now()};
      if (demo.leaves.some(x=>x.member===member&&x.kind===kind&&x.day===entry.day&&x.month===entry.month&&x.location===entry.location)) demoFail(409,'Aturan ini sudah dicatat.');
      if (demo.requests.some(x=>x.member===member&&demoUnavailable(member,x.day,x.location,x.service,[entry]))) demoFail(409,'Ada special request yang bertentangan. Hapus request itu terlebih dahulu.');
      const published=demo.schedules[kind==='day'?data.date.slice(0,7):data.month]?.published;
      if (published?.some(x=>x.member===member&&isUnavailable(member,x,[entry]))) demoFail(409,'Jadwal tanggal ini sudah terbit. Hubungi Emen untuk perubahan tugas.');
      demo.leaves.push(entry);return {ok:true};
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
      demo[key]=demo[key].filter(x=>x.id!==data.id||x.member!==member);return {ok:true};
    }
    const month=data?.month||url.searchParams.get('month')||demoMonth();
    if (!demoValidMonth(month)) demoFail(400,'Bulan tidak valid.');
    const record=demo.schedules[month];
    if (route === '/api/schedule') {
      const manager=['EMEN','EVAN'].includes(member),published=record?.published||null;
      const publishedSummary=published?summary(published):null;
      const draft=manager?record?.draft||null:null;
      return structuredClone({month,status:record?.status||null,approvalNote:manager?record?.approvalNote||null:null,draft,draftSummary:draft?summary(draft):null,published:manager?published:published?.filter(x=>x.member===member)||null,counts:published?Object.fromEntries(demoMembers.map(name=>[name,published.filter(x=>x.member===name).length])):null,ownPK:publishedSummary?.totals[member]??null,totals:manager?publishedSummary?.totals||null:null,publishedAt:record?.publishedAt||null,roles:member==='EMEN'?MEMBER_ROLES:undefined});
    }
    if (route === '/api/schedule/generate') {
      if (member!=='EMEN') demoFail(403,'Hanya Emen yang bisa generate jadwal.');
      if (record?.status==='pending') demoFail(409,'Jadwal sedang menunggu keputusan Evan.');
      const result=generate(month,demo.leaves,demo.requests);
      demo.schedules[month]={...record,draft:result.slots,status:'draft',approvalNote:null};return structuredClone(result);
    }
    if (!record?.draft) demoFail(404,'Buat draft jadwal dulu.');
    if (route === '/api/schedule/assign') {
      if (member!=='EMEN') demoFail(403,'Hanya Emen yang bisa mengubah draft.');
      if (record.status!=='draft') demoFail(409,'Draft sedang menunggu approval Evan.');
      try { validateAssignment(record.draft,data.index,data.member,demo.leaves); } catch(error){ demoFail(409,error.message); }
      record.draft[data.index].member=data.member;return {ok:true};
    }
    if (route === '/api/schedule/submit') {
      if (member!=='EMEN') demoFail(403,'Hanya Emen yang bisa mengajukan jadwal.');
      if (record.status!=='draft') demoFail(409,'Jadwal sudah diajukan.');
      demoComplete(record.draft);record.status='pending';record.approvalNote=null;return {status:'pending'};
    }
    if (['/api/schedule/approve','/api/schedule/reject'].includes(route)) {
      if (member!=='EVAN') demoFail(403,'Hanya Evan yang bisa memberi keputusan jadwal.');
      if (record.status!=='pending') demoFail(409,'Tidak ada jadwal yang menunggu approval.');
      if (route.endsWith('/reject')) {record.status='draft';record.approvalNote=data.note||'Perlu revisi dari Evan.';return {status:'draft'};}
      demoComplete(record.draft);record.published=structuredClone(record.draft);record.publishedAt=Date.now();record.status='published';record.approvalNote=null;return {status:'published'};
    }
    demoFail(404,'Endpoint demo tidak ditemukan.');
  }
};
