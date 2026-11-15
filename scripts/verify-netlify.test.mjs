import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyPage, retry} from './verify-netlify.mjs';
const marker = 'current-build';
const html = `<html><head><meta name="frame-build" content="${marker}"></head><body>FRAME<script>/* injected hosting badge */</script></body></html>`;
const page = (body = html, status = 200, type = 'text/html') => new Response(body, {status, headers: {'Content-Type': type}});
const url = 'https://example.netlify.app/';
test('accepts current HTML with hosting injection', async () => {
  assert.match(await verifyPage(url, marker, {fetchImpl: async () => page()}), /200/);
});
test('rejects stale builds, error pages, non-HTML, and truncated HTML', async () => {
  for (const response of [page(html.replace(marker,'old')), page('error',503), page(html,200,'application/json'), page(html.replace('</html>','')), page('<html>Login</html>')]) {
    await assert.rejects(verifyPage(url, marker, {fetchImpl: async () => response}));
  }
});
test('records same-origin redirects and rejects foreign redirects', async () => {
  let count = 0;
  assert.match(await verifyPage(url, marker, {fetchImpl: async () => ++count === 1 ? new Response(null,{status:302,headers:{location:'/index.html'}}) : page()}), /302.* -> 200/);
  await assert.rejects(verifyPage(url, marker, {fetchImpl: async () => new Response(null,{status:302,headers:{location:'https://login.example.com/'}})}), /unexpected redirect/);
});
test('retries stale deployment until ready; persistent failures fail', async () => {
  let count = 0;
  const options = {attempts:3, sleep:async()=>{}, log:()=>{}};
  await retry(() => verifyPage(url, marker, {fetchImpl:async()=>page(++count < 3 ? html.replace(marker,'old') : html)}), options);
  assert.equal(count,3);
  await assert.rejects(retry(async()=>{throw new Error('still unavailable');},options), /still unavailable/);
});
