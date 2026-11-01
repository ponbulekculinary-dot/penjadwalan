import {generate, summary, validateAssignment, isUnavailable, MEMBER_ROLES} from './scheduler.js';

const MEMBERS = new Set(['EMEN','DEDY','AYU','BOWO','ANDRE','BILLY','OWEN','MELVERN','DAUD','EVAN','TIMI','EVELYN','AGUS','DEMAS']);
const SERVICES = {Tamsir: new Set(['IR 1','IR 2','IR 3']), MOI: new Set(['IR 1','IR 2','IR 3','IR 4'])};
const encoder = new TextEncoder();
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers}});
const fail = (status, error) => json({error}, status);
const hex = bytes => [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
const fromHex = string => new Uint8Array(string.match(/.{2}/g).map(x => parseInt(x, 16)));
const now = () => Date.now();
const monthNow = () => {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit'}).formatToParts(new Date());
  return parts.find(x => x.type === 'year').value + '-' + parts.find(x => x.type === 'month').value;
};
const cookieToken = request => /(?:^|;\s*)session=([^;]+)/.exec(request.headers.get('Cookie') || '')?.[1];

async function sha256(text) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))));
}
async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const digest = await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 310000}, key, 256);
  return hex(salt) + ':' + hex(new Uint8Array(digest));
}
async function passwordMatches(password, stored) {
  const [salt, digest] = stored.split(':');
  const candidate = await hashPassword(password, fromHex(salt));
  // Both values have the same fixed length; compare all bytes.
  let difference = 0;
  const expected = fromHex(digest), actual = fromHex(candidate.split(':')[1]);
  for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ actual[i];
  return difference === 0;
}
async function memberFromSession(request, env) {
  const token = cookieToken(request);
  if (!token) return null;
  const row = await env.DB.prepare('SELECT member FROM sessions WHERE token_hash=? AND expires>?').bind(await sha256(token), now()).first();
  return row?.member || null;
}
function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T12:00:00Z');
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10) === value;
}
function validMonth(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
function blocked(rows, day, location, service) {
  return rows.some(row => row.kind === 'day' && row.day === day || row.month === day.slice(0,7) && (row.kind === 'month_off' || row.kind === 'month_morning' && (service !== 'IR 1' && service !== 'IR 2' || row.location !== 'Kedua lokasi' && row.location !== location)));
}
async function scheduleAvailability(env, month) {
  return (await env.DB.prepare("SELECT * FROM availability WHERE day LIKE ? OR month=?").bind(month+'-%', month).all()).results;
}
function invalidScheduledSlots(slots, availability) {
  return slots.some((slot, index) => !slot.member || isUnavailable(slot.member, slot, availability) || (() => {
    try { validateAssignment(slots, index, slot.member, availability); return false; }
    catch { return true; }
  })());
}
async function readBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return null;
  const body = await request.text();
  if (body.length > 16384) return null;
  try { const value = JSON.parse(body); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
  catch { return null; }
}

async function handleApi(request, env) {
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path === '/api/health') {
    try {
      const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','sessions','availability','requests','cash','schedules')").all();
      const account = tables.results.length === 6 && await env.DB.prepare('SELECT name FROM users LIMIT 1').first();
      if (!account) return fail(503, 'Layanan login belum siap. Coba hubungkan lagi nanti.');
      return json({service: 'frame-kamera', ready: true});
    } catch {
      return fail(503, 'Layanan login belum siap. Coba hubungkan lagi nanti.');
    }
  }
  if (request.method === 'GET' && path === '/api/schedule') {
    const member = await memberFromSession(request, env);
    if (!member) return fail(401, 'Silakan login.');
    const month = new URL(request.url).searchParams.get('month') || monthNow();
    if (!validMonth(month)) return fail(400, 'Bulan tidak valid.');
    const record = await env.DB.prepare('SELECT * FROM schedules WHERE month=?').bind(month).first();
    const manager = member === 'EMEN' || member === 'EVAN';
    const draft = manager && record?.draft_json ? JSON.parse(record.draft_json) : null;
    const allPublished = record?.published_json ? JSON.parse(record.published_json) : null;
    const counts = allPublished ? Object.fromEntries([...MEMBERS].map(name => [name, allPublished.filter(x=>x.member===name).length])) : null;
    const publishedSummary = allPublished ? summary(allPublished) : null;
    return json({month, status: record?.status || null, approvalNote: manager ? record?.approval_note || null : null,
      draft, draftSummary: draft ? summary(draft) : null,
      published: manager ? allPublished : allPublished?.filter(x=>x.member===member) || null,
      counts, ownPK: publishedSummary?.totals[member] ?? null,
      totals: manager ? publishedSummary?.totals || null : null,
      publishedAt: record?.published_at || null, roles: member === 'EMEN' ? MEMBER_ROLES : undefined});
  }
  if (request.method === 'GET' && path === '/api/state') {
    const member = await memberFromSession(request, env);
    if (!member) return fail(401, 'Silakan login.');
    const [leaves, requests, cash] = await Promise.all([
      env.DB.prepare('SELECT * FROM availability WHERE member=? ORDER BY created DESC').bind(member).all(),
      env.DB.prepare('SELECT * FROM requests WHERE member=? ORDER BY created DESC').bind(member).all(),
      member === 'BOWO'
        ? env.DB.prepare('SELECT member,status FROM cash WHERE month=?').bind(monthNow()).all()
        : env.DB.prepare('SELECT member,status FROM cash WHERE month=? AND member=?').bind(monthNow(), member).all()
    ]);
    return json({user: member, leaves: leaves.results, requests: requests.results, cash: Object.fromEntries(cash.results.map(x => [x.member, x.status])), month: monthNow()});
  }
  if (request.method !== 'POST') return fail(404, 'Endpoint tidak ditemukan.');
  const data = await readBody(request);
  if (!data) return fail(400, 'Data permintaan tidak valid.');
  if (path === '/api/login') {
    const name = String(data.username || '').trim().toUpperCase();
    const password = String(data.password || '');
    if (!MEMBERS.has(name)) return fail(401, 'Username atau password belum sesuai.');
    const row = await env.DB.prepare('SELECT password_hash FROM users WHERE name=?').bind(name).first();
    const matches = row && (row.password_hash ? await passwordMatches(password, row.password_hash) : password === 'Password123');
    if (!matches) {
      return fail(401, 'Username atau password belum sesuai.');
    }
    if (!row.password_hash) await env.DB.prepare('UPDATE users SET password_hash=? WHERE name=?').bind(await hashPassword(password), name).run();
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.prepare('INSERT INTO sessions VALUES (?,?,?)').bind(await sha256(token), name, now() + 7*24*60*60*1000).run();
    const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
    return json({user: name}, 200, {'Set-Cookie': `session=${token}; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=604800`});
  }
  const member = await memberFromSession(request, env);
  if (!member) return fail(401, 'Silakan login.');
  if (path === '/api/logout') {
    const token = cookieToken(request);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run();
    const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
    return json({ok: true}, 200, {'Set-Cookie': `session=; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=0`});
  }
  if (path === '/api/password') {
    const current = String(data.current || ''), next = String(data.next || '');
    const row = await env.DB.prepare('SELECT password_hash FROM users WHERE name=?').bind(member).first();
    const matches = row.password_hash ? await passwordMatches(current, row.password_hash) : current === 'Password123';
    if (!matches) return fail(400, 'Password saat ini tidak sesuai.');
    if (next.length < 8 || next === current) return fail(400, 'Password baru harus berbeda dan minimal 8 karakter.');
    await env.DB.prepare('UPDATE users SET password_hash=? WHERE name=?').bind(await hashPassword(next), member).run();
    return json({ok: true});
  }
  if (path === '/api/cash') {
    if (member !== 'BOWO') return fail(403, 'Hanya Bowo yang bisa mengubah status kas.');
    if (!MEMBERS.has(data.member) || !['paid','unpaid'].includes(data.status)) return fail(400, 'Status kas tidak valid.');
    await env.DB.prepare('INSERT INTO cash VALUES (?,?,?,?) ON CONFLICT(month,member) DO UPDATE SET status=excluded.status,updated_by=excluded.updated_by').bind(monthNow(), data.member, data.status, member).run();
    return json({ok: true});
  }
  if (path === '/api/schedule/generate') {
    if (member !== 'EMEN') return fail(403, 'Hanya Emen yang bisa generate jadwal.');
    const month = data.month;
    if (!validMonth(month)) return fail(400, 'Bulan tidak valid.');
    const current = await env.DB.prepare('SELECT status FROM schedules WHERE month=?').bind(month).first();
    if (current?.status === 'pending') return fail(409, 'Jadwal sedang menunggu keputusan Evan.');
    const [availability, requests] = await Promise.all([
      env.DB.prepare("SELECT * FROM availability WHERE day LIKE ? OR month=?").bind(month+'-%', month).all(),
      env.DB.prepare('SELECT * FROM requests WHERE day LIKE ?').bind(month+'-%').all()
    ]);
    const result = generate(month, availability.results, requests.results);
    await env.DB.prepare("INSERT INTO schedules(month,draft_json,generated_at,status) VALUES (?,?,?,'draft') ON CONFLICT(month) DO UPDATE SET draft_json=excluded.draft_json,generated_at=excluded.generated_at,status='draft',approval_note=NULL")
      .bind(month, JSON.stringify(result.slots), now()).run();
    return json({draft: result.slots, summary: result.summary});
  }
  if (path === '/api/schedule/assign') {
    if (member !== 'EMEN') return fail(403, 'Hanya Emen yang bisa mengubah draft.');
    const {month, index} = data, assignee = data.member;
    if (!validMonth(month) || !Number.isInteger(index) || assignee !== null && !MEMBERS.has(assignee)) return fail(400, 'Pilihan slot tidak valid.');
    const record = await env.DB.prepare('SELECT draft_json,status FROM schedules WHERE month=?').bind(month).first();
    if (!record?.draft_json) return fail(404, 'Buat draft jadwal dulu.');
    if (record.status !== 'draft') return fail(409, 'Draft sedang menunggu approval Evan.');
    const slots = JSON.parse(record.draft_json);
    if (index < 0 || index >= slots.length) return fail(400, 'Slot tidak ditemukan.');
    const availability = await scheduleAvailability(env, month);
    try { validateAssignment(slots, index, assignee, availability); }
    catch (error) { return fail(409, error.message); }
    slots[index].member = assignee;
    await env.DB.prepare('UPDATE schedules SET draft_json=? WHERE month=?').bind(JSON.stringify(slots), month).run();
    return json({draft: slots, summary: summary(slots)});
  }
  if (path === '/api/schedule/submit') {
    if (member !== 'EMEN') return fail(403, 'Hanya Emen yang bisa mengajukan jadwal.');
    const month = data.month;
    if (!validMonth(month)) return fail(400, 'Bulan tidak valid.');
    const record = await env.DB.prepare('SELECT draft_json,status FROM schedules WHERE month=?').bind(month).first();
    if (!record?.draft_json) return fail(404, 'Buat draft jadwal dulu.');
    if (record.status !== 'draft') return fail(409, 'Jadwal sudah diajukan.');
    const slots = JSON.parse(record.draft_json);
    if (slots.some(x=>!x.member)) return fail(409, 'Masih ada slot kosong. Lengkapi sebelum ajukan jadwal.');
    if (invalidScheduledSlots(slots, await scheduleAvailability(env, month))) return fail(409, 'Ada jadwal yang bertentangan dengan izin atau jam terbaru. Generate ulang.');
    await env.DB.prepare("UPDATE schedules SET status='pending',approval_note=NULL WHERE month=?").bind(month).run();
    return json({status: 'pending'});
  }
  if (path === '/api/schedule/approve' || path === '/api/schedule/reject') {
    if (member !== 'EVAN') return fail(403, 'Hanya Evan yang bisa memberi keputusan jadwal.');
    const month = data.month;
    if (!validMonth(month)) return fail(400, 'Bulan tidak valid.');
    const record = await env.DB.prepare('SELECT draft_json,status FROM schedules WHERE month=?').bind(month).first();
    if (!record?.draft_json || record.status !== 'pending') return fail(409, 'Tidak ada jadwal yang menunggu approval.');
    if (path.endsWith('/reject')) {
      await env.DB.prepare("UPDATE schedules SET status='draft',approval_note=? WHERE month=?").bind(String(data.note||'Perlu revisi dari Evan.').slice(0,500), month).run();
      return json({status: 'draft'});
    }
    const slots = JSON.parse(record.draft_json);
    if (invalidScheduledSlots(slots, await scheduleAvailability(env, month))) return fail(409, 'Jadwal sudah bertentangan dengan izin atau jam terbaru. Minta Emen revisi.');
    await env.DB.prepare("UPDATE schedules SET published_json=?,published_at=?,status='published',approved_by='EVAN',approval_note=NULL WHERE month=?")
      .bind(JSON.stringify(slots), now(), month).run();
    return json({status: 'published'});
  }
  if (path === '/api/availability') {
    const {kind} = data, day = data.date || '', month = data.month || '', location = data.location || '';
    if (!['day','month_off','month_morning'].includes(kind) || kind === 'day' && !validDay(day) || kind !== 'day' && !validMonth(month) || kind === 'month_morning' && !['Kedua lokasi','Tamsir','MOI'].includes(location)) return fail(400, 'Ketersediaan tidak valid.');
    const entry = {kind, day: kind === 'day' ? day : '', month: kind === 'day' ? '' : month, location: kind === 'month_morning' ? location : ''};
    const [availability, requests] = await Promise.all([
      env.DB.prepare('SELECT * FROM availability WHERE member=?').bind(member).all(),
      env.DB.prepare('SELECT * FROM requests WHERE member=?').bind(member).all()
    ]);
    if (availability.results.some(x => x.kind === kind && (kind === 'day' ? x.day === day : x.month === month && x.location === entry.location))) return fail(409, 'Aturan ini sudah dicatat.');
    if (requests.results.some(x => blocked([entry], x.day, x.location, x.service))) return fail(409, 'Ada special request yang bertentangan. Hapus request itu terlebih dahulu.');
    const affectedMonth = kind === 'day' ? day.slice(0,7) : month;
    const published = await env.DB.prepare('SELECT published_json FROM schedules WHERE month=?').bind(affectedMonth).first();
    if (published?.published_json && JSON.parse(published.published_json).some(slot => slot.member === member && isUnavailable(member, slot, [{member, ...entry}]))) {
      return fail(409, 'Jadwal tanggal ini sudah terbit. Hubungi Emen untuk perubahan tugas.');
    }
    await env.DB.prepare('INSERT INTO availability(member,kind,day,month,location,note,created) VALUES (?,?,?,?,?,?,?)').bind(member, kind, entry.day, entry.month, entry.location, String(data.note || '').slice(0,500), now()).run();
    return json({ok: true}, 201);
  }
  if (path === '/api/request') {
    const day = data.date, {location, service} = data;
    if (!validDay(day) || !SERVICES[location]?.has(service)) return fail(400, 'Tanggal atau ibadah tidak valid.');
    const [availability, existing] = await Promise.all([
      env.DB.prepare('SELECT * FROM availability WHERE member=?').bind(member).all(),
      env.DB.prepare('SELECT id FROM requests WHERE member=? AND day=? AND location=? AND service=?').bind(member, day, location, service).first()
    ]);
    if (blocked(availability.results, day, location, service)) return fail(409, 'Pilihan ini bertentangan dengan ketersediaan yang kamu catat.');
    if (existing) return fail(409, 'Request yang sama sudah diajukan.');
    await env.DB.prepare('INSERT INTO requests(member,day,location,service,note,created) VALUES (?,?,?,?,?,?)').bind(member, day, location, service, String(data.note || '').slice(0,500), now()).run();
    return json({ok: true}, 201);
  }
  if (path === '/api/delete') {
    if (!['availability','request'].includes(data.kind) || !Number.isInteger(data.id)) return fail(400, 'Data hapus tidak valid.');
    const table = data.kind === 'availability' ? 'availability' : 'requests';
    const result = await env.DB.prepare(`DELETE FROM ${table} WHERE id=? AND member=?`).bind(data.id, member).run();
    return result.meta.changes ? json({ok: true}) : fail(404, 'Data tidak ditemukan.');
  }
  return fail(404, 'Endpoint tidak ditemukan.');
}

export default {
  async fetch(request, env) {
    try {
      if (new URL(request.url).pathname.startsWith('/api/')) return await handleApi(request, env);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error('Request failed:', error);
      return fail(500, 'Terjadi masalah di server.');
    }
  }
};
