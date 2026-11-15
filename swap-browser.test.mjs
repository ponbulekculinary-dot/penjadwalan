import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
import worker from './worker.js';
import {slotsForMonth} from './scheduler.js';
import {d1,migrate,seed} from './test-support.mjs';

test('Emen can preview and save same-time swaps, undo both slots, and use the mobile dialog',async()=>{
 const db=new DatabaseSync(':memory:');migrate(db);seed(db,'SwapBrowser!2026');const slots=slotsForMonth('2026-11');
 const a=slots.findIndex(s=>s.date==='2026-11-01'&&s.location==='MOI'&&s.service==='IR 1'&&s.role==='SWITCHER');
 const b=slots.findIndex(s=>s.date==='2026-11-01'&&s.location==='Tamsir'&&s.service==='IR 1'&&s.role==='SWITCHER');
 slots[a].member='EVAN';slots[b].member='EMEN';db.prepare("INSERT INTO schedules(month,draft_json,status,revision,updated_by,action) VALUES ('2026-11',?,'draft',1,'EMEN','generate')").run(JSON.stringify(slots));
 const html=readFileSync('public/index.html','utf8'),env={DB:d1(db),ASSETS:{fetch:async()=>new Response(html,{headers:{'Content-Type':'text/html'}})}};
 const server=createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;const r=await worker.fetch(new Request('http://localhost'+req.url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:body}),env);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text())});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const p=await browser.newPage({viewport:{width:1366,height:950}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('https://fonts.**/*',r=>r.abort());await p.goto('http://127.0.0.1:'+server.address().port);
  await p.locator('[name=username]').fill('emen');await p.locator('[name=password]').fill('SwapBrowser!2026');await p.locator('#login-button').click();await p.locator('#workspace').waitFor({state:'visible'});await p.locator('#desktop-nav [data-nav=schedule]').click();await p.locator('#schedule-month').fill('2026-11');await p.locator('#schedule-month').dispatchEvent('change');
  await p.locator(`[data-review-slot="${a}"]`).click();assert.equal(await p.locator('#review-candidate option[value=EMEN]').getAttribute('disabled')!==null,true,await p.locator('#review-dialog').innerText());
  await p.locator('[data-swap-slot]').click();assert.equal(await p.locator('#swap-save').isDisabled(),true);await p.locator('#swap-target').selectOption(String(b));assert.equal(await p.locator('#swap-save').isEnabled(),true);assert.match(await p.locator('#swap-preview').innerText(),/EMEN menggantikan EVAN/);
  assert.ok(!(await p.locator('#swap-preview .check').innerText()).includes('Rp'));
  if(process.env.FRAME_SCREENSHOT_DIR){mkdirSync(process.env.FRAME_SCREENSHOT_DIR,{recursive:true});await p.screenshot({path:process.env.FRAME_SCREENSHOT_DIR+'/swap-desktop.png'});}
  for(const width of [320,375,430]){await p.setViewportSize({width,height:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await p.locator('#review-dialog').evaluate(d=>d.scrollWidth>d.clientWidth),false);}
  if(process.env.FRAME_SCREENSHOT_DIR)await p.screenshot({path:process.env.FRAME_SCREENSHOT_DIR+'/swap-mobile.png'});
  await p.locator('#swap-save').click();await p.locator('[data-undo-review]').waitFor();let row=db.prepare('SELECT draft_json,revision FROM schedules').get();let result=JSON.parse(row.draft_json);assert.equal(row.revision,2);assert.equal(result[a].member,'EMEN');assert.equal(result[b].member,'EVAN');
  await p.locator('[data-undo-review]').click();await p.waitForFunction(()=>!document.querySelector('[data-undo-review]'));result=JSON.parse(db.prepare('SELECT draft_json FROM schedules').get().draft_json);assert.deepEqual(result,slots);
  // The self-contained demo uses the same final-state validator and versioned swap route.
  const d=await browser.newPage();await d.route('**/*',r=>r.fulfill({contentType:'text/html',body:html}));await d.goto('http://frame-demo.test');
  const demo=await d.evaluate(async({a,b})=>{
    const api=window.FrameDemo.request.bind(window.FrameDemo),month='2026-11';await api('/api/login',{username:'emen',password:'Password123'});
    let s=await api('/api/schedule?month='+month);
    async function write(action,extra={}){const r=await api('/api/schedule/'+action,{month,revision:s.revision,availabilityRevision:s.availabilityRevision,...extra});s=await api('/api/schedule?month='+month);return r;}
    await write('generate');for(let i=0;i<s.draft.length;i++)if(['EMEN','EVAN'].includes(s.draft[i].member))await write('assign',{index:i,member:null});
    await write('assign',{index:a,member:'EVAN'});await write('assign',{index:b,member:'EMEN'});const before=s.revision;await write('swap',{index:a,targetIndex:b});
    return {a:s.draft[a].member,b:s.draft[b].member,delta:s.revision-before,action:s.history[0].action};
  },{a,b});assert.deepEqual(demo,{a:'EMEN',b:'EVAN',delta:1,action:'swap'});assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(r=>server.close(r));db.close()}
});
