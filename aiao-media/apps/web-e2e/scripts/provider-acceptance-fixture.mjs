import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, relative, resolve } from 'node:path';
import sharp from 'sharp';
import worker from '../../api/src/local-first-worker.ts';
import { platformAuthUrl, platformModel, setupPlatform, taskFixture } from '../src/platform-fixture.ts';
import { acceptanceSelection, attemptPath, runProviderAcceptance } from './provider-acceptance.mjs';

const root = resolve(import.meta.dirname, '../../web/dist/browser');
const temporaryRoot = resolve(import.meta.dirname, '../tmp');
await mkdir(temporaryRoot, { recursive: true, mode: 0o700 });
const temporaryDirectory = name => mkdtemp(resolve(temporaryRoot, `platform-acceptance-${name}-`));
const directory = await temporaryDirectory('fixture');
const settings = {
  origin: '',
  release: 'fixture-platform-v1',
  manifestSha256: createHash('sha256')
    .update(await readFile(resolve(root, 'offline-manifest.json')))
    .digest('hex'),
  model: platformModel.id,
  email: 'creator@example.test',
  password: 'fixture-platform-password',
  fixture: true
};
const pictures = new Map();
for (const size of ['1024x1024', '1536x1024', '1024x1536']) {
  const [width, height] = size.split('x').map(Number);
  const image = sharp({ create: { width, height, channels: 3, background: '#8a9c62' } });
  pictures.set(size, { png: await image.png().toBuffer(), jpeg: await image.jpeg({ progressive: true }).toBuffer() });
}
const wrongSize = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#8a9c62' } })
  .png()
  .toBuffer();
const relays = [];
let protocol = 'openai';
let signedIn = true;
let incorrectSize = false;
let changedManifest = false;
let systemError = false;
let forbiddenBodyReads = 0;
let resultRequests = 0;
const generationCalls = () => relays.reduce((total, relay) => total + relay.calls, 0);
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
  ASSETS: {
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      const file = resolve(root, `.${extname(pathname) ? pathname : '/index.html'}`);
      if (relative(root, file).startsWith('..')) return new Response(null, { status: 404 });
      const contents = await readFile(file);
      const body =
        pathname === '/offline-manifest.json' && changedManifest ?
          Buffer.concat([contents, Buffer.from('\n')])
        : contents;
      return new Response(body, {
        headers: { ...staticHeaders, 'content-type': types[extname(file)] ?? 'application/octet-stream' }
      });
    }
  }
};
const server = createServer(async (request, response) => {
  try {
    const result = await worker.fetch(
      new Request(new URL(request.url, settings.origin), { headers: request.headers }),
      env
    );
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
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin === settings.origin || url.origin === platformAuthUrl) return route.fallback();
    assert.equal(url.origin, 'https://results.example.test');
    const headers = await request.allHeaders();
    for (const name of ['authorization', 'cookie', 'referer']) assert.equal(headers[name], undefined);
    resultRequests++;
    return route.fulfill({ contentType: 'image/png', body: pictures.get(url.pathname.slice(1, -4)).png });
  });
  await setupPlatform(context, { signedIn, protocol });
  const relay = await taskFixture(context, request => {
    const body = request.postDataJSON();
    assert.deepEqual(Object.keys(body).sort(), ['model', 'n', 'prompt', 'size']);
    assert.equal(body.model, platformModel.id);
    assert.equal(body.n, 1);
    assert.ok(pictures.has(body.size));
    if (systemError) return { json: { base_resp: { status_code: 1033, status_msg: 'private fixture error' } } };
    if (incorrectSize) return { json: { data: [{ b64_json: wrongSize.toString('base64') }] } };
    if (protocol === 'minimax')
      return {
        json: {
          base_resp: { status_code: 0 },
          data: { image_base64: [pictures.get(body.size).jpeg.toString('base64')] }
        }
      };
    return { json: { data: [{ url: `https://results.example.test/${body.size}.png` }] } };
  });
  relays.push(relay);
}
function verifyRecords(records, mimeType, delivery) {
  assert.equal(records.length, 3);
  for (const record of records) {
    assert.equal(record.fixture, true);
    assert.equal(record.mode, 'platform');
    assert.equal(record.protocol, protocol);
    assert.equal(record.generationRequests, 1);
    assert.equal(record.image.mimeType, mimeType);
    assert.equal(record.image.delivery, delivery);
    assert.equal(record.image.credentialFreeResultRequest, delivery === 'base64' ? null : true);
    assert.equal(record.image.exactDownloadAfterReload, true);
    assert.equal(record.credits.cost, platformModel.credits);
    assert.equal(record.credits.before - record.credits.after, platformModel.credits);
    assert.equal(record.credits.ledgerEntries, 1);
    const evidence = JSON.stringify(record);
    for (const secret of [settings.email, settings.password, 'fixture-platform-refresh', 'x-relay-task-token'])
      assert.ok(!evidence.includes(secret));
  }
}
try {
  const records = await runProviderAcceptance(settings, directory, setupContext);
  verifyRecords(records, 'image/png', 'cross-origin-url');
  assert.equal(generationCalls(), 3);
  assert.equal(resultRequests, 3);
  await runProviderAcceptance(settings, directory, setupContext);
  assert.equal(generationCalls(), 3);
  changedManifest = true;
  const filesBefore = await readdir(directory);
  await assert.rejects(runProviderAcceptance(settings, directory, setupContext), /DEPLOYED_MANIFEST_MISMATCH/);
  assert.deepEqual(await readdir(directory), filesBefore);
  assert.equal(generationCalls(), 3);
  changedManifest = false;
  await writeFile(
    attemptPath(directory, settings, 'platform', 'square'),
    JSON.stringify({ ...records[0], phase: 'dispatching' })
  );
  await assert.rejects(runProviderAcceptance(settings, directory, setupContext), /PREVIOUS_ATTEMPT_REQUIRES_REVIEW/);
  const portrait = { ...settings, selection: acceptanceSelection({ AIAO_MEDIA_ACCEPTANCE_ASPECTS: 'portrait' }) };
  assert.equal((await runProviderAcceptance(portrait, directory, setupContext)).length, 1);
  assert.equal(generationCalls(), 3);
  await assert.rejects(
    runProviderAcceptance({ ...settings, release: 'fixture-platform-v2' }, directory, setupContext),
    /PREVIOUS_ATTEMPT_REQUIRES_REVIEW/
  );
  const preflightDirectory = await temporaryDirectory('preflight');
  await writeFile(
    attemptPath(preflightDirectory, settings, 'platform', 'portrait'),
    JSON.stringify({ ...records[2], phase: 'requires-review' })
  );
  await assert.rejects(
    runProviderAcceptance(settings, preflightDirectory, setupContext),
    /PREVIOUS_ATTEMPT_REQUIRES_REVIEW/
  );
  assert.equal(generationCalls(), 3);
  incorrectSize = true;
  const failedDirectory = await temporaryDirectory('invalid-size');
  await assert.rejects(runProviderAcceptance(settings, failedDirectory, setupContext), /ACCEPTANCE_STOPPED_REVIEW/);
  const failed = JSON.parse(await readFile(attemptPath(failedDirectory, settings, 'platform', 'square'), 'utf8'));
  assert.equal(failed.stage, 'result-size');
  assert.equal(failed.failureCode, 'RESULT_SIZE_MISMATCH');
  assert.equal(failed.assertionCode, 'NONE');
  assert.equal(generationCalls(), 4);
  await assert.rejects(
    runProviderAcceptance(settings, failedDirectory, setupContext),
    /PREVIOUS_ATTEMPT_REQUIRES_REVIEW/
  );
  assert.equal(generationCalls(), 4);
  incorrectSize = false;
  protocol = 'minimax';
  signedIn = false;
  const nativeDirectory = await temporaryDirectory('jpeg');
  const nativeRecords = await runProviderAcceptance(settings, nativeDirectory, setupContext);
  verifyRecords(nativeRecords, 'image/jpeg', 'base64');
  assert.equal(generationCalls(), 7);
  await runProviderAcceptance(settings, nativeDirectory, setupContext);
  assert.equal(generationCalls(), 7);
  systemError = true;
  const nativeFailedDirectory = await temporaryDirectory('business-error');
  await assert.rejects(
    runProviderAcceptance(settings, nativeFailedDirectory, setupContext),
    /ACCEPTANCE_STOPPED_REVIEW/
  );
  const nativeFailed = JSON.parse(
    await readFile(attemptPath(nativeFailedDirectory, settings, 'platform', 'square'), 'utf8')
  );
  assert.equal(nativeFailed.phase, 'requires-review');
  assert.equal(nativeFailed.failureCode, 'GENERATION_REJECTED_OR_UNCERTAIN');
  assert.equal(nativeFailed.generationRequests, 1);
  assert.ok(!JSON.stringify(nativeFailed).includes('private fixture'));
  assert.equal(generationCalls(), 8);
  assert.equal(relays.at(-1).account.balance, 1000);
  assert.equal(relays.at(-1).account.reserved, 0);
  await assert.rejects(
    runProviderAcceptance(settings, nativeFailedDirectory, setupContext),
    /PREVIOUS_ATTEMPT_REQUIRES_REVIEW/
  );
  assert.equal(generationCalls(), 8);
  assert.equal(resultRequests, 3);
  assert.equal(forbiddenBodyReads, 0);
  console.log(
    '平台 PNG/JPEG 三画幅、两种登录状态、积分结算与精确下载验收通过；产物变化、错误尺寸、业务错误和未知尝试均阻断重发。'
  );
} finally {
  await new Promise(resolve => server.close(resolve));
}
