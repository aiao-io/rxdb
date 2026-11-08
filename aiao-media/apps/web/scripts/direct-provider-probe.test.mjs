import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import sharp from 'sharp';
import { buildProbe, startProbeServer } from './direct-provider-probe.mjs';

let browser, staticApp, provider, temporary, providerOrigin, png;
let allowed = true,
  output = 'base64';
const requests = [];
const dummyKey = 'probe-fixture-key-not-a-real-secret';

before(async () => {
  await buildProbe();
  staticApp = await startProbeServer();
  temporary = await mkdtemp(join(tmpdir(), 'aiao-direct-probe-'));
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      join(temporary, 'key.pem'),
      '-out',
      join(temporary, 'cert.pem'),
      '-days',
      '1',
      '-subj',
      '/CN=localhost'
    ],
    { stdio: 'ignore' }
  );
  png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: '#8a9c62' }
  })
    .png()
    .toBuffer();
  provider = createServer(
    {
      key: await readFile(join(temporary, 'key.pem')),
      cert: await readFile(join(temporary, 'cert.pem'))
    },
    async (request, response) => {
      const entry = {
        method: request.method,
        path: request.url,
        origin: request.headers.origin,
        authorization: request.headers.authorization,
        cookie: request.headers.cookie,
        referer: request.headers.referer
      };
      requests.push(entry);
      if (allowed) {
        response.setHeader('Access-Control-Allow-Origin', request.headers.origin || staticApp.origin);
        response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'authorization,content-type');
        response.setHeader('Access-Control-Max-Age', '0');
      }
      if (request.method === 'OPTIONS') {
        response.writeHead(allowed ? 204 : 403).end();
        return;
      }
      if (request.method === 'GET' && request.url === '/result.png') {
        response.writeHead(200, { 'Content-Type': 'image/png' }).end(png);
        return;
      }
      if (request.method !== 'POST' || request.url !== '/v1/images/generations') {
        response.writeHead(404).end();
        return;
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      entry.body = JSON.parse(Buffer.concat(chunks).toString());
      if (output === 'unauthorized') {
        response
          .writeHead(401, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ error: { message: dummyKey } }));
        return;
      }
      const item =
        output === 'url' ?
          {
            url: providerOrigin.replace('127.0.0.1', 'localhost') + '/result.png'
          }
        : {
            b64_json: output === 'corrupt' ? Buffer.from('not a png').toString('base64') : png.toString('base64')
          };
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data: [item] }));
    }
  );
  await new Promise(yes => provider.listen(0, '127.0.0.1', yes));
  providerOrigin = `https://127.0.0.1:${provider.address().port}`;
  const channel =
    process.env.AIAO_PLAYWRIGHT_CHANNEL || (existsSync('/Applications/Google Chrome.app') ? 'chrome' : undefined);
  browser = await chromium.launch({
    ...(channel ? { channel } : {}),
    headless: true
  });
});
after(async () => {
  await browser?.close();
  await staticApp?.close();
  if (provider)
    await new Promise(yes => {
      provider.close(yes);
      provider.closeAllConnections();
    });
  if (temporary) await rm(temporary, { recursive: true, force: true });
});
async function pageFor(mode = 'base64', cors = true) {
  output = mode;
  allowed = cors;
  requests.length = 0;
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    acceptDownloads: true
  });
  const page = await context.newPage();
  await page.goto(staticApp.origin);
  await page.locator('#base-url').fill(providerOrigin + '/v1');
  await page.locator('#model').fill('fixture-image-model');
  await page.locator('#api-key').fill(dummyKey);
  return { context, page };
}
async function submit(page) {
  await page.locator('#generate').click();
  await page.waitForFunction(() => !['ready', 'sending'].includes(document.getElementById('status').dataset.phase));
  return page.locator('#status').getAttribute('data-phase');
}
test('real browser preflight, direct POST, PNG decoding and download work without a backend', async () => {
  const { context, page } = await pageFor();
  try {
    const urls = [];
    page.on('request', request => urls.push(request.url()));
    assert.equal(await submit(page), 'completed');
    const options = requests.find(r => r.method === 'OPTIONS');
    const posts = requests.filter(r => r.method === 'POST');
    assert.ok(options);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].authorization, `Bearer ${dummyKey}`);
    assert.equal(posts[0].cookie, undefined);
    assert.equal(posts[0].referer, undefined);
    assert.equal(posts[0].body.n, 1);
    assert.equal(posts[0].body.size, '1024x1024');
    assert.ok(urls.every(url => !url.includes('/api/') && !url.includes(dummyKey)));
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    const downloaded = page.waitForEvent('download');
    await page.locator('#download').click();
    assert.deepEqual(await readFile(await (await downloaded).path()), png);
    await page.reload();
    assert.equal(await page.locator('#api-key').inputValue(), '');
    assert.equal(requests.filter(r => r.method === 'POST').length, 1);
  } finally {
    await context.close();
  }
});
test('a denied CORS preflight stops the POST and causes no automatic retry', async () => {
  const { context, page } = await pageFor('base64', false);
  try {
    assert.equal(await submit(page), 'unknown');
    assert.equal(requests.filter(r => r.method === 'OPTIONS').length, 1);
    assert.equal(requests.filter(r => r.method === 'POST').length, 0);
    assert.match(await page.locator('#status').textContent(), /不会自动重试/);
    assert.equal(await page.locator('#download').isVisible(), false);
  } finally {
    await context.close();
  }
});
test('an image at a different origin is fetched without the provider Key', async () => {
  const { context, page } = await pageFor('url');
  try {
    assert.equal(await submit(page), 'completed');
    const image = requests.find(r => r.method === 'GET' && r.path === '/result.png');
    assert.ok(image);
    assert.equal(image.authorization, undefined);
    assert.equal(image.cookie, undefined);
    assert.equal(image.referer, undefined);
  } finally {
    await context.close();
  }
});
test('rejected credentials and invalid images never become a successful result or leak provider error text', async () => {
  for (const [mode, phase] of [
    ['unauthorized', 'rejected'],
    ['corrupt', 'result_unavailable']
  ]) {
    const { context, page } = await pageFor(mode);
    try {
      assert.equal(await submit(page), phase);
      assert.equal(await page.locator('#download').isVisible(), false);
      assert.ok(!(await page.locator('#status').textContent()).includes(dummyKey));
      assert.equal(requests.filter(r => r.method === 'POST').length, 1);
    } finally {
      await context.close();
    }
  }
});
test('double submission while active produces only one provider request', async () => {
  const { context, page } = await pageFor();
  try {
    await page.evaluate(() => {
      const form = document.getElementById('generate-form');
      form.requestSubmit();
      form.requestSubmit();
    });
    await page.waitForFunction(() => document.getElementById('status').dataset.phase === 'completed');
    assert.equal(requests.filter(r => r.method === 'POST').length, 1);
    assert.equal(await page.locator('#status').getAttribute('data-requests'), '1');
  } finally {
    await context.close();
  }
});
test('desktop and mobile fit without horizontal overflow; the static server exposes no API or env file', async () => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await mkdir('tmp/direct-provider-probe', { recursive: true, mode: 0o700 });
    for (const [name, width, height] of [
      ['desktop', 1440, 1100],
      ['mobile', 390, 844]
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(staticApp.origin);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const path = `tmp/direct-provider-probe/${name}.png`;
      await page.screenshot({ path, fullPage: true });
      await chmod(path, 0o600);
    }
    for (const path of ['/.env', '/api/generations', '/../.env'])
      assert.equal((await fetch(staticApp.origin + path)).status, 404);
    assert.equal(
      (
        await fetch(staticApp.origin, {
          method: 'POST',
          body: 'no business handler'
        })
      ).status,
      405
    );
  } finally {
    await context.close();
  }
});
