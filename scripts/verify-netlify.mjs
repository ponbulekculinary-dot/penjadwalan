import {readFileSync, appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export async function verifyPage(url, marker, {fetchImpl = fetch} = {}) {
  let target = new URL(url);
  const origin = target.origin;
  const trace = [];
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetchImpl(target, {
      redirect: 'manual', headers: {'Cache-Control': 'no-cache'}, signal: AbortSignal.timeout(20000),
    });
    trace.push(`${response.status} ${target.origin}${target.pathname}`);
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`${trace.join(' -> ')}: redirect without Location`);
      const next = new URL(location, target);
      if (next.origin !== origin) throw new Error(`${trace.join(' -> ')}: unexpected redirect to ${next.origin}${next.pathname}`);
      target = next;
      continue;
    }
    const type = response.headers.get('content-type') || '';
    const body = await response.text();
    const diagnostic = `${trace.join(' -> ')}; content-type=${type}; bytes=${Buffer.byteLength(body)}`;
    if (response.status !== 200) throw new Error(`${diagnostic}; expected HTTP 200`);
    if (!type.toLowerCase().includes('text/html')) throw new Error(`${diagnostic}; expected HTML`);
    // A hosting-injected badge/analytics script may change the bytes. The exact
    // build marker must still be present in the HTML document that is served.
    const found = /<meta\b[^>]*\bname\s*=\s*["']frame-build["'][^>]*\bcontent\s*=\s*["']([^"']+)["'][^>]*>/i.exec(body);
    if (found?.[1] !== marker || !/<\/html\s*>/i.test(body)) throw new Error(`${diagnostic}; missing/wrong build marker or incomplete HTML`);
    return diagnostic;
  }
  throw new Error(`${trace.join(' -> ')}: too many redirects`);
}

export async function retry(check, {attempts = 8, delay = 10000, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), log = console.log} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await check(); }
    catch (error) {
      log(`Verification attempt ${attempt}/${attempts}: ${error.message}`);
      if (attempt === attempts) throw error;
      await sleep(delay);
    }
  }
}

async function main() {
  const result = JSON.parse(readFileSync(`${process.env.RUNNER_TEMP}/netlify-deploy.json`, 'utf8'));
  const {NETLIFY_SITE_ID: siteId, NETLIFY_AUTH_TOKEN: token, FRAME_BUILD_ID: marker} = process.env;
  if (!siteId || !token || !marker || !result.deploy_id) throw new Error('Missing site credentials, build marker, or deployment ID');
  const api = async path => {
    const response = await fetch(`https://api.netlify.com/api/v1/${path}`, {
      headers: {Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Netlify API HTTP ${response.status}`);
    return response.json();
  };
  const production = 'https://phenomenal-banoffee-60d264.netlify.app/';
  await retry(async () => {
    const deploy = await api(`deploys/${encodeURIComponent(result.deploy_id)}`);
    const site = await api(`sites/${encodeURIComponent(siteId)}`);
    if (deploy.site_id !== siteId || site.name !== 'phenomenal-banoffee-60d264') throw new Error('Deployment/site identity mismatch');
    if (deploy.state !== 'ready') throw new Error(`Deployment is ${deploy.state}, not ready`);
    if (site.published_deploy?.id !== result.deploy_id) throw new Error('Production site has not published this deployment');
    // Use the authenticated API's HTTPS permalink, not the CLI's possibly HTTP URL.
    const permalink = new URL(deploy.deploy_ssl_url);
    if (permalink.protocol !== 'https:' || permalink.hostname !== `${result.deploy_id}--${site.name}.netlify.app`) throw new Error('Unexpected deployment permalink');
    for (const url of [permalink.href, production]) {
      console.log(await verifyPage(url, marker));
    }
  });
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Verified production deployment ${result.deploy_id}\n\nBuild: ${marker}\n\n${production}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {console.error(error.message); process.exitCode = 1;});
}
