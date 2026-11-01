import {before, after, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
let browser;
before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
});
after(async () => { await browser?.close(); });

async function setup(t, {javascript = true, csp, health, login, keepSession = true} = {}) {
  const context = await browser.newContext({javaScriptEnabled: javascript, viewport: {width: 390, height: 844}});
  t.after(() => context.close());
  const page = await context.newPage();
  let loggedIn = false;
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const send = (body, status = 200) => route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
    if (url.hostname !== 'frame.test') return route.abort();
    if (url.pathname === '/') return route.fulfill({contentType: 'text/html', headers: csp ? {'Content-Security-Policy': csp} : {}, body: html});
    if (url.pathname === '/api/health') return health ? health(route) : send({service: 'frame-kamera', ready: true});
    if (url.pathname === '/api/login') {
      if (login) return login(route);
      loggedIn = true;
      return send({user: 'EMEN'});
    }
    if (url.pathname === '/api/state') return loggedIn && keepSession
      ? send({user: 'EMEN', leaves: [], requests: [], cash: {}})
      : send({error: 'Silakan login.'}, 401);
    return send({error: 'Tidak ditemukan.'}, 404);
  });
  await page.goto('http://frame.test');
  return {page, errors};
}
async function enterCredentials(page) {
  await page.locator('[name=username]').fill('emen');
  await page.locator('[name=password]').fill('Password123');
}
async function message(page, selector, part) {
  await page.waitForFunction(({selector, part}) => document.querySelector(selector).textContent.includes(part), {selector, part});
  assert.ok((await page.locator(selector).textContent()).includes(part));
}

test('preview without JavaScript never offers a working login', async t => {
  const {page} = await setup(t, {javascript: false});
  assert.equal(await page.locator('[name=username]').isDisabled(), true);
  assert.equal(await page.locator('#login-button').isDisabled(), true);
  assert.match(await page.locator('#login-status').textContent(), /alamat web yang aktif/);
});

test('preview blocking scripts keeps the connection explanation visible', async t => {
  const {page} = await setup(t, {csp: "script-src 'none'"});
  assert.equal(await page.locator('#login-button').isDisabled(), true);
  assert.match(await page.locator('#login-status').textContent(), /Login belum tersedia/);
});

test('a static HTML server shows an actionable message and can retry', async t => {
  let ready = false;
  const {page, errors} = await setup(t, {health: route => ready
    ? route.fulfill({contentType: 'application/json', body: JSON.stringify({service: 'frame-kamera', ready: true})})
    : route.fulfill({contentType: 'text/html', body: '<html>Preview only</html>'})});
  await message(page, '#login-status', 'Halaman tampilan saja');
  assert.equal(await page.locator('#login-button').isDisabled(), true);
  ready = true;
  await page.locator('#login-retry').click();
  await message(page, '#login-status', 'Terhubung.');
  assert.equal(await page.locator('#login-button').isEnabled(), true);
  assert.deepEqual(errors, []);
});

test('wrong password produces a visible error and permits another attempt', async t => {
  const {page} = await setup(t, {login: route => route.fulfill({status: 401, contentType: 'application/json', body: JSON.stringify({error: 'Username atau password belum sesuai.'})})});
  await enterCredentials(page);
  await page.locator('#login-button').click();
  await message(page, '#login-error', 'Username atau password');
  assert.equal(await page.locator('#login-button').isEnabled(), true);
});

test('network failure produces a connection message rather than raw fetch text', async t => {
  const {page} = await setup(t, {login: route => route.abort('failed')});
  await enterCredentials(page);
  await page.locator('#login-button').click();
  await message(page, '#login-error', 'Tidak bisa menghubungi');
});

test('pending login shows progress, blocks duplicate submissions, and times out', async t => {
  const {page} = await setup(t, {login: () => {}});
  await enterCredentials(page);
  await page.locator('#login-button').click();
  await message(page, '#login-button', 'Sedang masuk');
  assert.equal(await page.locator('#login-button').isDisabled(), true);
  await message(page, '#login-error', 'belum merespons');
  assert.equal(await page.locator('#login-button').isEnabled(), true);
});

test('blocked session storage points the user to the app in a browser', async t => {
  const {page} = await setup(t, {keepSession: false});
  await enterCredentials(page);
  await page.locator('#login-button').click();
  await message(page, '#login-error', 'sesi login tidak tersimpan');
});

test('connected login opens the member dashboard', async t => {
  const {page, errors} = await setup(t);
  await enterCredentials(page);
  await page.locator('#login-button').click();
  await page.locator('#workspace').waitFor({state: 'visible'});
  assert.equal(await page.locator('#login').isHidden(), true);
  assert.match(await page.locator('#view h1').textContent(), /Emen/);
  assert.deepEqual(errors, []);
});

test('Codex-style preview can explicitly run the demo without a backend', async t => {
  const {page, errors} = await setup(t, {health: route => route.fulfill({contentType:'text/html',body:'<html>Static preview</html>'})});
  await message(page, '#login-status', 'Halaman tampilan saja');
  assert.equal(await page.locator('#login-button').isDisabled(), true);
  const requests=[];
  page.on('request', request=>{if(new URL(request.url()).pathname.startsWith('/api/'))requests.push(request.url())});
  page.on('dialog', dialog=>dialog.accept());
  await page.locator('#demo-start').click();
  await message(page,'#login-status','Demo siap');
  async function loginAs(name){
    await page.locator('[name=username]').fill(name);
    await page.locator('[name=password]').fill('Password123');
    await page.locator('#login-button').click();
    await page.locator('#workspace').waitFor({state:'visible'});
  }
  async function logout(){
    await page.locator('#mobile-nav [data-nav=account]').click();
    await page.locator('#mobile-logout').click();
    await page.locator('#login').waitFor({state:'visible'});
  }
  await loginAs('emen');
  assert.equal(await page.locator('#demo-banner').isVisible(),true);
  await page.locator('#mobile-nav [data-nav=schedule]').click();
  await page.locator('[data-generate]').click();
  await page.locator('[data-submit]').click();
  await page.getByText('Menunggu Evan',{exact:true}).waitFor();
  await logout();await loginAs('evan');
  await page.locator('#mobile-nav [data-nav=schedule]').click();
  await page.locator('[data-approve]').click();
  await page.getByText('Sudah terbit',{exact:true}).waitFor();
  await logout();await loginAs('bowo');
  await page.locator('#mobile-nav [data-nav=schedule]').click();
  await page.getByText('Total PK saya',{exact:true}).waitFor();
  assert.equal(await page.getByText('Jumlah pelayanan tim',{exact:true}).count(),1);
  assert.equal(await page.getByText('Total PK tim',{exact:true}).count(),0);
  assert.deepEqual(requests,[]);
  assert.deepEqual(errors,[]);
  // Reload starts a fresh demo; it cannot be mistaken for shared persisted data.
  await page.reload();
  await page.locator('#demo-start').click();
  await loginAs('bowo');
  await page.locator('#mobile-nav [data-nav=schedule]').click();
  await page.getByText('Jadwal bulan ini belum diterbitkan.',{exact:true}).waitFor();
});
