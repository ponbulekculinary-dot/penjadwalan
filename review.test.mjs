import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import worker from './worker.js';
import {d1,migrate,seed} from './test-support.mjs';

test('real API + persistent SQLite: Emen edit/undo, Evan approval, member agenda and mobile',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'frame-browser-'));const db=new DatabaseSync(join(dir,'app.sqlite'));migrate(db);seed(db,'BrowserOnly!2026');
 const html=readFileSync('public/index.html','utf8'), env={DB:d1(db),ASSETS:{fetch:async()=>new Response(html,{headers:{'Content-Type':'text/html'}})}};
 const server=createServer(async(req,res)=>{try{let body='';for await(const chunk of req)body+=chunk;const result=await worker.fetch(new Request('http://localhost'+req.url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:body}),env);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());}catch(e){res.writeHead(500);res.end(String(e));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://fonts.**/*',r=>r.abort());
  page.on('dialog',d=>d.accept('Periksa kembali pembagian tugas.'));
  const login=async(user)=>{await page.goto(url);await page.locator('[name=username]').fill(user);await page.locator('[name=password]').fill('BrowserOnly!2026');await page.locator('#login-button').click();await page.locator('#workspace').waitFor({state:'visible'});};
  const schedule=async()=>{await page.locator('#desktop-nav [data-nav=schedule]').click();await page.locator('#schedule-month').fill('2026-11');await page.locator('#schedule-month').dispatchEvent('change');await page.locator('[data-generate]').waitFor();};
  await login('emen');await schedule();await page.locator('[data-generate]').click();await page.locator('[data-submit]').waitFor();assert.equal(await page.locator('[data-review-slot]').count(),110);
  assert.ok(!(await page.locator('.review-table').innerText()).includes('Rp'));
  await page.locator('[data-review-slot="0"]').click();await page.locator('#review-candidate').selectOption('');await page.locator('#review-save').click();await page.locator('[data-undo-review]').waitFor();assert.equal(await page.locator('[data-submit]').isDisabled(),true);await page.reload();await page.locator('#workspace').waitFor({state:'visible'});await schedule();assert.equal(await page.locator('[data-submit]').isDisabled(),true); // survived reload/login cookie
  await page.locator('[data-review-slot="0"]').click();const candidate=await page.locator('#review-candidate option:not([disabled])').evaluateAll(opts=>opts.find(o=>o.value)?.value);await page.locator('#review-candidate').selectOption(candidate);await page.locator('#review-save').click();await page.locator('[data-submit]:not([disabled])').waitFor();
  await page.locator('[data-review-tab=recap]').click();await page.locator('#review-sort').selectOption('least');await page.locator('[data-review-member=DEDY]').click();await page.locator('#review-dialog [data-review-slot]').first().click();await page.locator('#review-impact').waitFor();await page.locator('[data-close-review]').first().click();
  await page.locator('[data-review-tab=availability]').click();await page.getByRole('heading',{name:/Ketersediaan tim/}).waitFor();
  await page.locator('[data-review-tab=grid]').click();await page.locator('[data-submit]').click();await page.getByText('Menunggu Evan',{exact:true}).waitFor();await page.locator('#logout').click();
  await login('evan');await page.locator('#desktop-nav [data-nav=schedule]').click();await page.locator('#schedule-month').fill('2026-11');await page.locator('#schedule-month').dispatchEvent('change');await page.locator('[data-approve]').click();await page.getByText('Sudah terbit',{exact:true}).waitFor();
  const published=JSON.parse(db.prepare('SELECT published_json FROM schedules WHERE month=?').get('2026-11').published_json);const groups=new Map();for(const s of published){const key=s.member+'|'+s.date;groups.set(key,(groups.get(key)||0)+1)}const pair=[...groups].find(([k,n])=>n>=2&&!k.startsWith('EMEN|')&&!k.startsWith('EVAN|'));assert.ok(pair);const [member,date]=pair[0].split('|');
  await page.locator('#logout').click();await login(member.toLowerCase());await page.locator('#desktop-nav [data-nav=schedule]').click();await page.locator('#schedule-month').fill('2026-11');await page.locator('#schedule-month').dispatchEvent('change');await page.getByRole('heading',{name:'Total PK saya',exact:true}).waitFor();await page.locator('[data-review-filter=date]').fill(date);await page.locator('[data-review-filter=date]').dispatchEvent('change');assert.equal(await page.locator('.review-agenda details').count(),pair[1]);await page.locator('.review-agenda summary').first().click();assert.ok(!(await page.locator('.review-agenda').innerText()).includes('Rp'));
  for(const width of [320,375,430]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile overflow '+width);}
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
});
