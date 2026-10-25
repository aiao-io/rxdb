import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, relative, resolve } from 'node:path';
import sharp from 'sharp';
import worker from '../../aiao-media/deploy/local-first-worker.mjs';
import { acceptanceSelection, attemptPath, runProviderAcceptance } from './provider-acceptance.mjs';

const root = resolve(import.meta.dirname, '../../aiao-media/dist/browser');
await mkdir(resolve(import.meta.dirname, '../tmp'), { recursive: true, mode: 0o700 });
const directory = await mkdtemp(resolve(import.meta.dirname, '../tmp/provider-acceptance-fixture-'));
const settings = {
  origin: '',
  release: 'fixture-production-worker-v1',
  manifestSha256: createHash('sha256')
    .update(await readFile(resolve(root, 'offline-manifest.json')))
    .digest('hex'),
  baseUrl: 'https://provider.example.test/v1',
  model: 'fixture-image',
  key: 'fixture-acceptance-key-only',
  fixture: true
};
const images = new Map();
for (const size of ['1024x1024', '1536x1024', '1024x1536']) {
  const [width, height] = size.split('x').map(Number);
  images.set(
    size,
    await sharp({ create: { width, height, channels: 3, background: '#8a9c62' } })
      .png()
      .toBuffer()
  );
}
const calls = { direct: 0, proxy: 0, result: 0 };
let forbiddenBodyReads = 0;
let incorrectSize = false;
let changedManifest = false;
const wrongSize = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#8a9c62' } })
  .png()
  .toBuffer();
function upstream(body, headers, mode) {
  assert.equal(headers.get('authorization'), `Bearer ${settings.key}`);
  assert.equal(headers.get('cookie'), null);
  assert.equal(body.model, settings.model);
  assert.equal(body.n, 1);
  assert.ok(images.has(body.size));
  calls[mode]++;
  return { data: [{ url: `https://results.example.test/${body.size}.png` }] };
}
const fetchBefore = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), `${settings.baseUrl}/images/generations`);
  assert.equal(init.redirect, 'manual');
  return Response.json(upstream(JSON.parse(init.body), new Headers(init.headers), 'proxy'));
};
const types = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};
const staticHeaders = Object.fromEntries(
  (await readFile(resolve(root, '_headers'), 'utf8'))
    .split('\n')
    .slice(1)
    .filter(line => line.startsWith('  '))
    .map(line => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
    })
);
const env = {
  ALLOWED_PROVIDER_BASE_URLS: JSON.stringify([settings.baseUrl]),
  ASSETS: {
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      const file = resolve(root, `.${extname(pathname) ? pathname : '/index.html'}`);
      if (relative(root, file).startsWith('..')) return new Response(null, { status: 404 });
      let contents =
        pathname === '/app-config.js' ? 'globalThis.__AIAO_SUPABASE_CONFIG__ = null;' : await readFile(file);
      if (pathname === '/offline-manifest.json' && changedManifest)
        contents = Buffer.concat([Buffer.from(contents), Buffer.from('\n')]);
      return new Response(contents, {
        headers: { ...staticHeaders, 'content-type': types[extname(file)] ?? 'application/octet-stream' }
      });
    }
  }
};
const server = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const method = request.method;
    const incoming = new Request(new URL(request.url, settings.origin), {
      method,
      headers: request.headers,
      ...(method === 'POST' ? { body: Buffer.concat(chunks) } : {})
    });
    const result = await worker.fetch(incoming, env);
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    response.writeHead(500).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
settings.origin = `http://127.0.0.1:${server.address().port}`;
async function setupContext(context) {
  context.on('page', page =>
    page.on('response', response => {
      response.body = async () => {
        forbiddenBodyReads++;
        throw new Error('PLAYWRIGHT_RESPONSE_BODY_FORBIDDEN');
      };
    })
  );
  await context.addCookies([
    {
      name: 'private-result-session',
      value: 'fixture-cookie-must-not-be-sent',
      domain: 'results.example.test',
      path: '/',
      secure: true,
      sameSite: 'None'
    }
  ]);
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === settings.origin) return route.fallback();
    if (request.url() === `${settings.baseUrl}/images/generations`)
      return route.fulfill({
        json: upstream(request.postDataJSON(), new Headers(await request.allHeaders()), 'direct')
      });
    if (url.origin !== 'https://results.example.test') return route.abort('blockedbyclient');
    const headers = await request.allHeaders();
    for (const name of ['authorization', 'cookie', 'referer']) assert.equal(headers[name], undefined);
    calls.result++;
    return route.fulfill({
      contentType: 'image/png',
      body: incorrectSize ? wrongSize : images.get(url.pathname.slice(1, -4))
    });
  });
}
try {
  const records = await runProviderAcceptance(settings, directory, setupContext);
  assert.equal(records.length, 6);
  assert.deepEqual(calls, { direct: 3, proxy: 3, result: 6 });
  for (const record of records) {
    assert.equal(record.image.delivery, 'cross-origin-url');
    assert.equal(record.image.credentialFreeResultRequest, true);
    assert.equal(record.image.exactDownloadAfterReload, true);
    assert.ok(!JSON.stringify(record).includes(settings.key));
  }
  await runProviderAcceptance(settings, directory, setupContext);
  assert.deepEqual(calls, { direct: 3, proxy: 3, result: 6 });
  changedManifest = true;
  const filesBefore = await readdir(directory);
  await assert.rejects(runProviderAcceptance(settings, directory, setupContext), /DEPLOYED_MANIFEST_MISMATCH/);
  assert.deepEqual(await readdir(directory), filesBefore);
  assert.deepEqual(calls, { direct: 3, proxy: 3, result: 6 });
  changedManifest = false;
  const file = attemptPath(directory, settings, 'direct', 'square');
  await writeFile(file, JSON.stringify({ ...records[0], phase: 'dispatching' }));
  await assert.rejects(runProviderAcceptance(settings, directory, setupContext), /PREVIOUS_ATTEMPT_REQUIRES_REVIEW/);
  assert.deepEqual(calls, { direct: 3, proxy: 3, result: 6 });
  const proxy = { ...settings, selection: acceptanceSelection({ AIAO_MEDIA_ACCEPTANCE_MODES: 'proxy' }) };
  const proxyRecords = await runProviderAcceptance(proxy, directory, setupContext);
  assert.equal(proxyRecords.length, 3);
  assert.ok(proxyRecords.every(record => record.mode === 'proxy' && record.phase === 'verified'));
  assert.deepEqual(calls, { direct: 3, proxy: 3, result: 6 });
  const portrait = {
    ...settings,
    selection: acceptanceSelection({ AIAO_MEDIA_ACCEPTANCE_MODES: 'proxy', AIAO_MEDIA_ACCEPTANCE_ASPECTS: 'portrait' })
  };
  assert.equal((await runProviderAcceptance(portrait, directory, setupContext)).length, 1);
  assert.deepEqual(calls, { direct: 3, proxy: 3, result: 6 });
  const blocked = {
    ...settings,
    selection: acceptanceSelection({ AIAO_MEDIA_ACCEPTANCE_MODES: 'direct', AIAO_MEDIA_ACCEPTANCE_ASPECTS: 'square' })
  };
  await assert.rejects(runProviderAcceptance(blocked, directory, setupContext), /PREVIOUS_ATTEMPT_REQUIRES_REVIEW/);
  assert.deepEqual(calls, { direct: 3, proxy: 3, result: 6 });
  incorrectSize = true;
  const failedDirectory = await mkdtemp(resolve(import.meta.dirname, '../tmp/provider-acceptance-invalid-size-'));
  await assert.rejects(runProviderAcceptance(settings, failedDirectory, setupContext), /ACCEPTANCE_STOPPED_REVIEW/);
  const failed = JSON.parse(await readFile(attemptPath(failedDirectory, settings, 'direct', 'square'), 'utf8'));
  assert.equal(failed.stage, 'result-size');
  assert.equal(failed.failureCode, 'RESULT_SIZE_MISMATCH');
  assert.equal(failed.assertionCode, 'NONE');
  assert.deepEqual(calls, { direct: 4, proxy: 3, result: 7 });
  assert.equal(forbiddenBodyReads, 0);
  await assert.rejects(
    runProviderAcceptance(settings, failedDirectory, setupContext),
    /PREVIOUS_ATTEMPT_REQUIRES_REVIEW/
  );
  assert.deepEqual(calls, { direct: 4, proxy: 3, result: 7 });
  console.log('6 个生产 Worker/fixture 验收组合通过；产物变化和错误尺寸被拒绝，成功复用和中断/失败阻断均未重发。');
} finally {
  globalThis.fetch = fetchBefore;
  await new Promise(resolve => server.close(resolve));
}
