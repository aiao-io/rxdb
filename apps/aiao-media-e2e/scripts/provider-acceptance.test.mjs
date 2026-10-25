import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import {
  acceptancePlan,
  acceptanceSelection,
  assertionCode,
  attemptPath,
  failureCode,
  generationDispatch,
  generationImageResult,
  liveSettings,
  readResultHeaders
} from './provider-acceptance.mjs';
import { installFetchCapture } from './provider-fetch-capture.mjs';
import { observeResultNetwork, resultNetworkFailure } from './provider-result-network.mjs';

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
  assert.equal(failureCode(new Error('PREVIOUS_ATTEMPT_REQUIRES_REVIEW')), 'PREVIOUS_ATTEMPT_REQUIRES_REVIEW');
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

test('MiniMax 正式入口只接收已适配模型，错误发生在任何生成前', () => {
  const native = { ...config, AIAO_IMAGE_BASE_URL: 'https://api.minimax.cn/v1', AIAO_IMAGE_MODEL: 'image-01' };
  assert.equal(liveSettings(native).model, 'image-01');
  assert.throws(() => liveSettings({ ...native, AIAO_IMAGE_MODEL: 'unsupported-image' }), /INVALID_MODEL/);
});

test('正式验收按通道验证 MiniMax 原生请求与既有代理入口契约', () => {
  const settings = { ...liveSettings(config), baseUrl: 'https://api.minimax.cn/v1', model: 'image-01' };
  const ratio = { size: '1536x1024' };
  assert.deepEqual(generationDispatch(settings, 'direct', ratio, '测试'), {
    url: 'https://api.minimax.cn/v1/image_generation',
    body: {
      model: 'image-01',
      prompt: '测试',
      n: 1,
      width: 1536,
      height: 1024,
      response_format: 'url',
      prompt_optimizer: false
    }
  });
  assert.deepEqual(generationDispatch(settings, 'proxy', ratio, '测试'), {
    url: `${settings.origin}/api/relay`,
    body: { model: 'image-01', prompt: '测试', n: 1, size: '1536x1024', quality: 'low', output_format: 'png' }
  });
});

test('MiniMax 验收只读取单一成功结果，系统错误和混合结果不能通过', () => {
  const base = 'https://api.minimax.cn/v1';
  assert.deepEqual(
    generationImageResult(
      { base_resp: { status_code: 0 }, data: { image_urls: ['https://images.example/image.png'] } },
      base
    ),
    {
      url: 'https://images.example/image.png',
      b64_json: undefined
    }
  );
  assert.deepEqual(generationImageResult({ base_resp: { status_code: 0 }, data: { image_base64: ['YQ=='] } }, base), {
    url: undefined,
    b64_json: 'YQ=='
  });
  for (const result of [
    { base_resp: { status_code: 1033, status_msg: 'private-test-key' } },
    { base_resp: { status_code: '0' }, data: { image_urls: ['https://images.example/image.png'] } },
    {
      base_resp: { status_code: 0 },
      data: { image_urls: ['https://images.example/image.png'], image_base64: ['YQ=='] }
    },
    { base_resp: { status_code: 0 }, data: { image_urls: 'https://images.example/image.png' } }
  ])
    assert.throws(
      () => generationImageResult(result, base),
      error => ['GENERATION_REJECTED_OR_UNCERTAIN', 'ORIGINAL_RESULT_UNAVAILABLE'].includes(error.message)
    );
});

test('原图 fetch 拒绝立即落入固定失败记录，保留原异常且不重发', async () => {
  const original = new TypeError('private-test-key https://results.example.test/image.jpg?token=secret');
  let calls = 0;
  await captureFixture(
    async () => {
      calls++;
      if (calls === 1) return new Response('{}');
      throw original;
    },
    async state => {
      await fetch('/api/relay', { method: 'POST' });
      await assert.rejects(fetch('https://results.example.test/image.jpg'), error => error === original);
      assert.equal(state.results.get('https://results.example.test/image.jpg')?.phase, 'settled');
      assert.equal(state.results.get('https://results.example.test/image.jpg')?.code, 'RESULT_FETCH_FAILED');
      assert.equal(calls, 2);
      assert.equal(failureCode(new Error('RESULT_FETCH_FAILED')), 'RESULT_FETCH_FAILED');
    }
  );
});

test('原图网络事件区分 CORS、CSP、连接和重定向，仅输出固定字段', () => {
  const session = new EventEmitter();
  const snapshot = observeResultNetwork(session);
  const url = 'https://private.example.test/image.jpg?token=secret';
  session.emit('Network.requestWillBeSent', { requestId: '1', request: { url, method: 'GET' } });
  session.emit('Network.responseReceivedExtraInfo', {
    requestId: '1',
    statusCode: 200,
    headers: { secret: 'private-test-key' }
  });
  session.emit('Network.loadingFailed', {
    requestId: '1',
    errorText: 'net::ERR_FAILED',
    corsErrorStatus: { corsError: 'MissingAllowOriginHeader', failedParameter: 'private-test-key' }
  });
  assert.equal(snapshot(url).phase, 'failed');
  assert.equal(snapshot(url).httpStatus, 200);
  assert.equal(snapshot(url).corsError, 'MissingAllowOriginHeader');
  assert.equal(resultNetworkFailure(snapshot(url)), 'RESULT_CORS_BLOCKED');
  assert.ok(!JSON.stringify(snapshot(url)).includes('private'));
  assert.ok(!JSON.stringify(snapshot(url)).includes('secret'));
  session.emit('Network.loadingFailed', { requestId: '1', errorText: 'private-test-key', blockedReason: 'csp' });
  assert.equal(resultNetworkFailure(snapshot(url)), 'RESULT_CSP_BLOCKED');
  session.emit('Network.loadingFailed', { requestId: '1', errorText: 'net::ERR_CONNECTION_REFUSED' });
  assert.equal(snapshot(url).networkError, 'CONNECTION_REFUSED');
  assert.equal(resultNetworkFailure(snapshot(url)), 'RESULT_REQUEST_FAILED');
  session.emit('Network.responseReceivedExtraInfo', { requestId: '1', statusCode: 302 });
  assert.equal(resultNetworkFailure(snapshot(url)), 'RESULT_REDIRECT_BLOCKED');
  session.emit('Network.loadingFailed', {
    requestId: '1',
    errorText: 'private-test-key',
    corsErrorStatus: { corsError: 'private-test-key' },
    blockedReason: 'private-test-key'
  });
  assert.ok(!JSON.stringify(snapshot(url)).includes('private'));
  assert.equal(snapshot('https://other.example.test').phase, 'not-requested');
  for (const code of [
    'RESULT_CORS_BLOCKED',
    'RESULT_CSP_BLOCKED',
    'RESULT_REQUEST_FAILED',
    'RESULT_REDIRECT_BLOCKED',
    'RESULT_RESPONSE_TIMEOUT',
    'RESULT_REQUEST_NOT_OBSERVED'
  ])
    assert.equal(failureCode(new Error(code)), code);
});

test('原图状态接受先到的附加响应信息，成功与 HTTP 错误不误判为网络失败', () => {
  const session = new EventEmitter();
  const snapshot = observeResultNetwork(session);
  const url = 'https://results.example.test/image.jpg';
  session.emit('Network.responseReceivedExtraInfo', { requestId: '2', statusCode: 404 });
  session.emit('Network.requestWillBeSent', { requestId: '2', request: { url, method: 'GET' } });
  session.emit('Network.responseReceived', { requestId: '2', response: { status: 404 } });
  session.emit('Network.loadingFinished', { requestId: '2' });
  assert.equal(snapshot(url).phase, 'finished');
  assert.equal(snapshot(url).httpStatus, 404);
  assert.equal(resultNetworkFailure(snapshot(url)), null);
  const copy = snapshot(url);
  copy.httpStatus = 200;
  assert.equal(snapshot(url).httpStatus, 404);
});

test('CSP 在 HTTP 请求前阻断仍可定位，仅报告策略不被当成失败', () => {
  const session = new EventEmitter();
  const snapshot = observeResultNetwork(session);
  const url = 'https://results.example.test/private.jpg?token=secret';
  const issue = {
    blockedURL: url,
    isReportOnly: true,
    contentSecurityPolicyViolationType: 'kURLViolation',
    violatedDirective: "connect-src 'self'"
  };
  session.emit('Audits.issueAdded', { issue: { details: { contentSecurityPolicyIssueDetails: issue } } });
  assert.equal(snapshot(url).phase, 'not-requested');
  issue.isReportOnly = false;
  session.emit('Audits.issueAdded', { issue: { details: { contentSecurityPolicyIssueDetails: issue } } });
  assert.equal(resultNetworkFailure(snapshot(url)), 'RESULT_CSP_BLOCKED');
  assert.ok(!JSON.stringify(snapshot(url)).includes('secret'));
});

test('带 CORS 原因的重定向响应保留 CORS 分类，不把结果缺失推断成重定向策略拒绝', () => {
  const session = new EventEmitter();
  const snapshot = observeResultNetwork(session);
  const url = 'https://results.example.test/image.jpg';
  session.emit('Network.requestWillBeSent', { requestId: '3', request: { url, method: 'GET' } });
  session.emit('Network.responseReceivedExtraInfo', { requestId: '3', statusCode: 302 });
  session.emit('Network.loadingFailed', {
    requestId: '3',
    errorText: 'net::ERR_FAILED',
    corsErrorStatus: { corsError: 'MissingAllowOriginHeader' }
  });
  assert.equal(resultNetworkFailure(snapshot(url)), 'RESULT_CORS_BLOCKED');
});
