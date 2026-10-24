import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { startProbeServer } from './direct-provider-probe.mjs';

// Explicit one-image trial only. No credentials are written to reports or screenshots.
if (existsSync('.env')) process.loadEnvFile('.env');
const raw = process.env.AIAO_IMAGE_BASE_URL;
const key = process.env.AIAO_IMAGE_API_KEY;
const model = process.env.AIAO_IMAGE_MODEL;
if (!raw || !key || !model)
  throw new Error('Configure the existing private AIAO_IMAGE_BASE_URL / API_KEY / MODEL variables.');
const base = new URL(raw);
if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash)
  throw new Error('Invalid private provider configuration.');
const endpoint = new URL(base);
endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') + '/images/generations';
await mkdir('tmp/direct-provider-probe', { recursive: true, mode: 0o700 });
const app = await startProbeServer(4310);
const report = {
  checkedAt: new Date().toISOString(),
  pageOrigin: app.origin,
  preflight: {},
  generated: false,
  automaticRetry: false
};
let browser;
let attemptCreated = false;
try {
  try {
    const response = await fetch(endpoint, {
      method: 'OPTIONS',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        Origin: app.origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type'
      }
    });
    report.preflight = {
      status: response.status,
      allowOrigin: response.headers.get('access-control-allow-origin'),
      allowMethods: response.headers.get('access-control-allow-methods'),
      allowHeaders: response.headers.get('access-control-allow-headers')
    };
    await response.body?.cancel();
  } catch {
    report.preflight = { status: 'unavailable' };
  }
  if (process.env.AIAO_DIRECT_PROBE_GENERATE !== '1') {
    await writeFile('tmp/direct-provider-probe/preflight.json', JSON.stringify(report, null, 2) + '\n', {
      mode: 0o600
    });
    console.log(JSON.stringify(report, null, 2));
  } else {
    // A previous attempt must be reviewed before another live request is permitted.
    await writeFile(
      'tmp/direct-provider-probe/live-attempt.json',
      JSON.stringify({ ...report, phase: 'prepared' }, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 }
    );
    attemptCreated = true;
    const channel =
      process.env.AIAO_PLAYWRIGHT_CHANNEL || (existsSync('/Applications/Google Chrome.app') ? 'chrome' : undefined);
    browser = await chromium.launch({
      ...(channel ? { channel } : {}),
      headless: true
    });
    const context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1440, height: 1100 }
    });
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send('Network.enable');
    report.browser = {
      preflightResponses: [],
      corsErrors: [],
      providerResponses: []
    };
    session.on('Network.responseReceived', event => {
      if (event.response.url !== endpoint.href) return;
      if (event.type === 'Preflight')
        report.browser.preflightResponses.push({
          status: event.response.status
        });
      else
        report.browser.providerResponses.push({
          status: event.response.status
        });
    });
    session.on('Network.loadingFailed', event => {
      if (event.corsErrorStatus) report.browser.corsErrors.push(event.corsErrorStatus.corsError);
    });
    await page.goto(app.origin);
    await page.locator('#base-url').fill(base.href);
    await page.locator('#model').fill(model);
    await page.locator('#api-key').fill(key);
    await writeFile(
      'tmp/direct-provider-probe/live-attempt.json',
      JSON.stringify({ ...report, phase: 'dispatching' }, null, 2) + '\n',
      { mode: 0o600 }
    );
    await page.locator('#generate').click();
    await page.waitForFunction(
      () => !['ready', 'sending'].includes(document.getElementById('status').dataset.phase),
      null,
      { timeout: 160000 }
    );
    report.phase = await page.locator('#status').getAttribute('data-phase');
    report.message = await page.locator('#status').textContent();
    report.requestCount = Number(await page.locator('#status').getAttribute('data-requests'));
    if (report.phase === 'completed') {
      report.generated = true;
      report.width = Number(await page.locator('#status').getAttribute('data-width'));
      report.height = Number(await page.locator('#status').getAttribute('data-height'));
      report.bytes = Number(await page.locator('#status').getAttribute('data-bytes'));
      const waiting = page.waitForEvent('download');
      await page.locator('#download').click();
      await (await waiting).saveAs('tmp/direct-provider-probe/live-result.png');
      await chmod('tmp/direct-provider-probe/live-result.png', 0o600);
    }
    await page.locator('#api-key').fill('');
    await page.screenshot({
      path: 'tmp/direct-provider-probe/live-browser.png',
      fullPage: true
    });
    await chmod('tmp/direct-provider-probe/live-browser.png', 0o600);
    await writeFile('tmp/direct-provider-probe/live-attempt.json', JSON.stringify(report, null, 2) + '\n', {
      mode: 0o600
    });
    console.log(JSON.stringify(report, null, 2));
  }
} catch (error) {
  if (attemptCreated) {
    report.phase = 'unknown';
    report.message = 'Trial interrupted. Review the provider record before any further attempt.';
    await writeFile('tmp/direct-provider-probe/live-attempt.json', JSON.stringify(report, null, 2) + '\n', {
      mode: 0o600
    });
  }
  console.error(
    error?.code === 'EEXIST' ?
      'A live attempt already exists. Review tmp/direct-provider-probe/live-attempt.json; no new request was sent.'
    : 'Probe could not finish; no automatic retry was performed.'
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  await app.close();
}
