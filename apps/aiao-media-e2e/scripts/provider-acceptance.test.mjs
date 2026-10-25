import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  acceptancePlan,
  acceptanceSelection,
  assertionCode,
  attemptPath,
  failureCode,
  liveSettings,
  readResultHeaders
} from './provider-acceptance.mjs';
import { installFetchCapture } from './provider-fetch-capture.mjs';

const config = {
  AIAO_MEDIA_ACCEPTANCE_GENERATE: '1',
  AIAO_MEDIA_ACCEPTANCE_ORIGIN: 'https://media.aiao.io',
  AIAO_MEDIA_ACCEPTANCE_RELEASE: '92883918-76ac-47de-a424-4bc5af23bee9',
  AIAO_MEDIA_ACCEPTANCE_MANIFEST_SHA256: 'a'.repeat(64),
  AIAO_IMAGE_BASE_URL: 'https://provider.example.test/v1/',
  AIAO_IMAGE_MODEL: 'image-test',
  AIAO_IMAGE_API_KEY: 'private-test-key'
};

test('默认计划覆盖两通道三画幅，显式选择仅保留指定子集', () => {
  const defaults = acceptancePlan(acceptanceSelection({}));
  assert.equal(defaults.length, 6);
  const selection = acceptanceSelection({
    AIAO_MEDIA_ACCEPTANCE_MODES: 'proxy',
    AIAO_MEDIA_ACCEPTANCE_ASPECTS: 'landscape,portrait'
  });
  assert.deepEqual(selection, { modes: ['proxy'], aspects: ['landscape', 'portrait'] });
  assert.deepEqual(
    acceptancePlan(selection).map(({ mode, ratio }) => [mode, ratio.aspect]),
    [
      ['proxy', 'landscape'],
      ['proxy', 'portrait']
    ]
  );
});

test('非法、空或重复选择在任何请求前拒绝，选择范围不改变尝试身份', () => {
  for (const mode of ['', 'auto', 'DIRECT', 'direct,proxy,other', 'proxy,proxy'])
    assert.throws(() => acceptanceSelection({ AIAO_MEDIA_ACCEPTANCE_MODES: mode }));
  for (const aspect of ['', 'wide', 'square,square', 'portrait,other'])
    assert.throws(() => acceptanceSelection({ AIAO_MEDIA_ACCEPTANCE_ASPECTS: aspect }));
  const settings = liveSettings(config);
  const selected = {
    ...settings,
    selection: acceptanceSelection({ AIAO_MEDIA_ACCEPTANCE_MODES: 'proxy', AIAO_MEDIA_ACCEPTANCE_ASPECTS: 'portrait' })
  };
  assert.equal(
    attemptPath('/tmp/acceptance', settings, 'proxy', 'portrait'),
    attemptPath('/tmp/acceptance', selected, 'proxy', 'portrait')
  );
});

test('诊断仅返回固定错误码，供应商 URL、Key 与原始异常不进入输出', () => {
  assert.equal(failureCode(new Error('RESULT_SIZE_MISMATCH')), 'RESULT_SIZE_MISMATCH');
  const timeout = new Error('private-test-key https://private.example.test?token=secret');
  timeout.name = 'TimeoutError';
  assert.equal(failureCode(timeout), 'BROWSER_TIMEOUT');
  assert.equal(failureCode(new Error('expect(locator).toBeVisible private-test-key')), 'BROWSER_ASSERTION');
  assert.equal(failureCode(new Error('private-test-key https://private.example.test')), 'BROWSER_OPERATION_FAILED');
  assert.equal(assertionCode({ matcherResult: { name: 'toBeVisible' } }), 'ELEMENT_VISIBLE');
  assert.equal(assertionCode({ matcherResult: { name: 'private-test-key' } }), 'NONE');
});

test('原图请求元数据失败只返回固定错误码且不重读', async () => {
  let reads = 0;
  await assert.rejects(
    readResultHeaders({
      allHeaders() {
        reads++;
        throw new Error('private-test-key https://private.example.test?token=secret');
      }
    }),
    error => error.message === 'RESULT_HEADERS_READ_FAILED'
  );
  assert.equal(reads, 1);
});

async function captureFixture(fetch, run, limits = {}) {
  const previous = globalThis.fetch;
  const previousCapture = globalThis.__AIAO_ACCEPTANCE_CAPTURE__;
  globalThis.fetch = fetch;
  installFetchCapture({
    generationUrl: 'https://app.example.test/api/relay',
    pageOrigin: 'https://app.example.test',
    generationLimit: 24 * 1024 * 1024,
    resultLimit: 16 * 1024 * 1024,
    timeoutMs: 1000,
    ...limits
  });
  try {
    await run(globalThis.__AIAO_ACCEPTANCE_CAPTURE__);
  } finally {
    globalThis.fetch = previous;
    globalThis.__AIAO_ACCEPTANCE_CAPTURE__ = previousCapture;
  }
}

test('捕获保留原Response与参数，只调用一次native fetch，不等待clone读取', async () => {
  let release;
  const json = '{"data":[{"url":"https://results.example.test/image.png"}]}';
  const original = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(json.slice(0, 10)));
        release = () => {
          controller.enqueue(new TextEncoder().encode(json.slice(10)));
          controller.close();
        };
      }
    })
  );
  const image = new Response(Uint8Array.from([137, 80, 78, 71]));
  const init = { method: 'POST', headers: { authorization: 'Bearer private-test-key' }, body: '{}' };
  let calls = 0;
  await captureFixture(
    (url, options) => {
      calls++;
      if (calls === 1) {
        assert.equal(url, '/api/relay');
        assert.equal(options, init);
        return Promise.resolve(original);
      }
      return Promise.resolve(image);
    },
    async state => {
      assert.equal(await fetch('/api/relay', init), original);
      assert.equal(state.generation.phase, 'pending');
      assert.equal(await fetch('https://results.example.test/image.png'), image);
      release();
      assert.equal(await original.text(), json);
      assert.equal(Buffer.from((await state.generation.promise).base64, 'base64').toString(), json);
      const result = await state.results.get('https://results.example.test/image.png').promise;
      assert.deepEqual(Buffer.from(result.base64, 'base64'), Buffer.from(await image.arrayBuffer()));
      assert.equal(calls, 2);
      assert.ok(!JSON.stringify(state).includes('private-test-key'));
    }
  );
});

test('clone超限与失败不改变原响应、不等待另一分支取消，也不增加网络调用', async () => {
  const original = new Response('larger-than-limit');
  let calls = 0;
  await captureFixture(
    () => {
      calls++;
      return Promise.resolve(original);
    },
    async state => {
      assert.equal(await fetch('/api/relay', { method: 'POST' }), original);
      assert.deepEqual(await state.generation.promise, { ok: false, code: 'GENERATION_CAPTURE_TOO_LARGE' });
      assert.equal(await original.text(), 'larger-than-limit');
      assert.equal(calls, 1);
    },
    { generationLimit: 4 }
  );
  const used = new Response('already-read');
  await used.text();
  await captureFixture(
    () => Promise.resolve(used),
    async state => {
      assert.equal(await fetch('/api/relay', { method: 'POST' }), used);
      assert.deepEqual(await state.generation.promise, { ok: false, code: 'GENERATION_CAPTURE_FAILED' });
    }
  );
});

test('原图捕获限制16MiB对应预算和条数，超限仍保留原响应', async () => {
  let calls = 0;
  await captureFixture(
    () => {
      calls++;
      return Promise.resolve(new Response('payload'));
    },
    async state => {
      await fetch('/api/relay', { method: 'POST' });
      await state.generation.promise;
      for (let index = 0; index < 5; index++) {
        const original = await fetch(`https://results.example.test/${index}.png`);
        assert.equal(await original.text(), 'payload');
      }
      assert.deepEqual(await state.results.get('https://results.example.test/0.png').promise, {
        ok: false,
        code: 'RESULT_CAPTURE_TOO_LARGE'
      });
      assert.equal(state.results.size, 4);
      assert.equal(state.resultCaptureCount, 4);
      assert.equal(state.resultLimitReached, true);
      assert.equal(calls, 6);
      const first = state.results.get('https://results.example.test/0.png');
      await fetch('https://results.example.test/0.png');
      assert.equal(state.results.get('https://results.example.test/0.png'), first);
      assert.equal(state.resultCaptureCount, 4);
      assert.equal(state.duplicateResults.has('https://results.example.test/0.png'), true);
    },
    { resultLimit: 4 }
  );
});

test('base64跨多个分块与非三字节边界仍逐字节一致', async () => {
  const bytes = Buffer.alloc(65539, 138);
  await captureFixture(
    () => Promise.resolve(new Response(bytes)),
    async state => {
      const original = await fetch('/api/relay', { method: 'POST' });
      const result = await state.generation.promise;
      assert.deepEqual(Buffer.from(result.base64, 'base64'), bytes);
      assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
    }
  );
});

test('捕获有截止时间，取消观察分支不等待应用消费且不产生失败promise', async () => {
  const original = new Response(new ReadableStream());
  await captureFixture(
    () => Promise.resolve(original),
    async state => {
      assert.equal(await fetch('/api/relay', { method: 'POST' }), original);
      assert.deepEqual(await state.generation.promise, { ok: false, code: 'GENERATION_CAPTURE_TIMEOUT' });
      await original.body.cancel();
    },
    { timeoutMs: 10 }
  );
});

test('真实供应商验收必须显式启用且只接受已决定的正式 origin', () => {
  assert.throws(() => liveSettings({ ...config, AIAO_MEDIA_ACCEPTANCE_GENERATE: undefined }));
  for (const origin of ['http://media.aiao.io', 'https://other.example.test', 'https://media.aiao.io?secret=value'])
    assert.throws(() => liveSettings({ ...config, AIAO_MEDIA_ACCEPTANCE_ORIGIN: origin }));
  assert.throws(() => liveSettings({ ...config, DEBUG: 'pw:api' }));
  assert.throws(() => liveSettings({ ...config, PWDEBUG: '1' }));
  assert.throws(() => liveSettings({ ...config, AIAO_MEDIA_ACCEPTANCE_RELEASE: undefined }));
  assert.throws(() => liveSettings({ ...config, AIAO_MEDIA_ACCEPTANCE_RELEASE: '../release' }));
  assert.throws(() => liveSettings({ ...config, AIAO_MEDIA_ACCEPTANCE_MANIFEST_SHA256: undefined }));
  assert.throws(() => liveSettings({ ...config, AIAO_MEDIA_ACCEPTANCE_MANIFEST_SHA256: '../manifest' }));
  assert.equal(liveSettings(config).baseUrl, 'https://provider.example.test/v1');
});

test('私有配置在浏览器启动前拒绝 URL 凭据、查询、片段与非法模型', () => {
  for (const base of [
    'http://provider.example.test',
    'https://key@provider.example.test',
    'https://provider.example.test?key=x',
    'https://provider.example.test#key'
  ])
    assert.throws(() => liveSettings({ ...config, AIAO_IMAGE_BASE_URL: base }));
  assert.throws(() => liveSettings({ ...config, AIAO_IMAGE_MODEL: '../image' }));
  assert.throws(() => liveSettings({ ...config, AIAO_IMAGE_API_KEY: undefined }));
});

test('尝试身份包含已部署版本、origin、规范化 provider、模型、通道和画幅，轮换 Key 不能绕过锁定', () => {
  const settings = liveSettings(config);
  const path = attemptPath('/tmp/acceptance', settings, 'direct', 'square');
  assert.match(path, /^\/tmp\/acceptance\/[a-f0-9]{64}\.json$/);
  assert.equal(path, attemptPath('/tmp/acceptance', { ...settings, key: 'rotated-private-key' }, 'direct', 'square'));
  assert.notEqual(path, attemptPath('/tmp/acceptance', settings, 'proxy', 'square'));
  assert.notEqual(path, attemptPath('/tmp/acceptance', settings, 'direct', 'portrait'));
  assert.notEqual(
    path,
    attemptPath('/tmp/acceptance', { ...settings, manifestSha256: 'b'.repeat(64) }, 'direct', 'square')
  );
  assert.notEqual(
    path,
    attemptPath('/tmp/acceptance', { ...settings, release: '92883918-76ac-47de-a424-4bc5af23bee0' }, 'direct', 'square')
  );
});
