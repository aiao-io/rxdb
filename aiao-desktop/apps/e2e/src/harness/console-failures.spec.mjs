import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { collectPageErrors, isExpectedLoadFailure } from './console-failures.mjs';
import { STANDIN_ORIGIN } from './standin.mjs';

const ORIGIN = 'http://127.0.0.1:4411';
const failure = (text, url = '', engine = 'chromium', extra = {}) =>
  isExpectedLoadFailure({ text, url, origin: ORIGIN, engine, ...extra });

// 下面的消息文字与 location 都是各引擎实测所得（Playwright 1.65）：Chromium 与 WebKit 的网络层日志把失败资源放在
// location().url；Firefox 的跨源报错 location().url 为空、地址在文字里；应用自己 catch 住后 console.error 的
// 「NetworkError when attempting to fetch resource.」「Load failed」没有来源可查。

test('Chromium：外部来源的资源加载失败（外网被拦截）是预期内的噪音', () => {
  assert.equal(failure('Failed to load resource: net::ERR_FAILED', 'https://tile.openstreetmap.org/1/2/3.png'), true);
  assert.equal(
    failure('Failed to load resource: the server responded with a status of 503 ()', 'https://api.open-meteo.com/v1'),
    true
  );
  assert.equal(failure('Failed to load resource: net::ERR_INTERNET_DISCONNECTED', `${STANDIN_ORIGIN}/`), true);
});

test('Chromium：桌面自己来源的资源加载失败是真问题（404 的图标、字体、wasm、chunk）', () => {
  for (const file of ['icons/app.png', 'assets/font.woff2', 'sqlite-wasm/wa-sqlite.wasm', 'chunk-ABC.js']) {
    assert.equal(
      failure('Failed to load resource: the server responded with a status of 404 (Not Found)', `${ORIGIN}/${file}`),
      false,
      file
    );
  }
  assert.equal(failure('Failed to load resource: net::ERR_FAILED', `${ORIGIN}/chunk-ABC.js`), false);
});

test('Chromium：看不出来源的加载失败不忽略——没有 location、不是 http(s) 地址、地址解析不了', () => {
  assert.equal(failure('Failed to load resource: net::ERR_FAILED', ''), false);
  assert.equal(failure('Failed to load resource: net::ERR_FAILED', 'data:image/png;base64,AAAA'), false);
  assert.equal(failure('Failed to load resource: net::ERR_FAILED', 'chrome-extension://abc/x.js'), false);
  assert.equal(failure('Failed to load resource: net::ERR_FAILED', 'not a url'), false);
});

test('Chromium：应用自己 console.error 的网络类文字没有来源可查，不能忽略', () => {
  assert.equal(failure('NetworkError when attempting to fetch resource.', `${ORIGIN}/main.js`), false);
  assert.equal(failure('Load failed', `${ORIGIN}/main.js`), false);
  assert.equal(failure('Uncaught (in promise) net::ERR_FAILED', ''), false);
});

test('Firefox：地址在文字里的跨源报错按文字里的地址判定', () => {
  const blocked = address =>
    `[JavaScript Error: "Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at ${address}. (Reason: CORS request did not succeed). Status code: (null)."]`;
  assert.equal(failure(blocked('https://api.open-meteo.com/v1/forecast?x=1'), '', 'firefox'), true);
  assert.equal(failure(blocked(`${ORIGIN}/api/data`), '', 'firefox'), false);
  // 句末的标点不算地址的一部分：「…at http://127.0.0.1:4411. (Reason…」仍是桌面自己
  assert.equal(failure(blocked(ORIGIN), '', 'firefox'), false);
});

test('Firefox 与 WebKit：完全无法归属来源的消息保留现有忽略（D-19 下是可选诊断）', () => {
  assert.equal(failure('NetworkError when attempting to fetch resource.', `${ORIGIN}/app.js`, 'firefox'), true);
  assert.equal(failure('NS_BINDING_ABORTED', '', 'firefox'), true);
  assert.equal(failure('Load failed', '', 'webkit'), true);
  assert.equal(failure('Load failed', '', 'chromium'), false);
});

test('WebKit：地址在文字里的访问控制报错按文字判定；网络层日志按 location', () => {
  assert.equal(
    failure('Fetch API cannot load https://api.github.com/user due to access control checks.', '', 'webkit'),
    true
  );
  assert.equal(failure(`Fetch API cannot load ${ORIGIN}/data.json due to access control checks.`, '', 'webkit'), false);
  assert.equal(
    failure('XMLHttpRequest cannot load https://a.example/x due to access control checks.', '', 'webkit'),
    true
  );
  assert.equal(
    failure(
      'Failed to load resource: the server responded with a status of 404 (Not Found)',
      `${ORIGIN}/a.png`,
      'webkit'
    ),
    false
  );
  assert.equal(
    failure(
      'Failed to load resource: the server responded with a status of 404 (Not Found)',
      'https://x.example/a.png',
      'webkit'
    ),
    true
  );
});

test('文字里除了外部地址还出现桌面自己的地址：不能确认全是外部来源，不忽略', () => {
  const text = `Fetch API cannot load https://api.example.com/x due to access control checks. Caller ${ORIGIN}/app.js`;
  assert.equal(failure(text, '', 'webkit'), false);
  // 外部地址的查询串里带着桌面地址，失败的资源仍是那个外部地址
  const redirect = `Fetch API cannot load https://api.example.com/x?back=${ORIGIN}/cb due to access control checks.`;
  assert.equal(failure(redirect, '', 'webkit'), true);
});

test('Failed to load resource 以 location 为准，文字里提到的桌面地址（如允许的来源）不影响判定', () => {
  const text = `Failed to load resource: Origin ${ORIGIN} is not allowed by Access-Control-Allow-Origin.`;
  assert.equal(failure(text, 'https://api.example.com/x', 'webkit'), true);
});

test('与加载失败无关的控制台错误从不忽略', () => {
  assert.equal(failure('TypeError: x is not a function', 'https://api.example.com/x'), false);
  assert.equal(failure('Uncaught ReferenceError: y is not defined', ''), false);
  assert.equal(failure('', ''), false);
});

test('测试主动让同源资源加载失败时，登记它的完整地址后这条失败不算页面错误', () => {
  const abort = 'Failed to load resource: net::ERR_INTERNET_DISCONNECTED';
  const expected = [`${ORIGIN}/approved-apps.json`];
  assert.equal(failure(abort, `${ORIGIN}/approved-apps.json`, 'chromium', { expected }), true);
  // 只放过登记的那一个地址：同源的其他失败仍然是错误
  assert.equal(failure(abort, `${ORIGIN}/other.json`, 'chromium', { expected }), false);
  assert.equal(failure(abort, `${ORIGIN}/approved-apps.json?x=1`, 'chromium', { expected }), false);
  assert.equal(failure(abort, `${ORIGIN}/approved-apps.json`, 'chromium', { expected: [] }), false);
});

test('collectPageErrors：页面错误与未被忽略的控制台错误都记进 errors，控制台错误带上来源位置', () => {
  const page = new EventEmitter();
  const errors = [];
  assert.equal(collectPageErrors(page, { errors, origin: ORIGIN, engine: 'chromium', expected: [] }), page);
  const consoleMessage = (type, text, url = '', lineNumber = 0) => ({
    type: () => type,
    text: () => text,
    location: () => ({ url, lineNumber })
  });
  page.emit('pageerror', new Error('boom'));
  page.emit(
    'console',
    consoleMessage('error', 'Failed to load resource: net::ERR_FAILED', 'https://tile.example/1.png')
  );
  page.emit(
    'console',
    consoleMessage(
      'error',
      'Failed to load resource: the server responded with a status of 404 (Not Found)',
      `${ORIGIN}/icons/a.png`
    )
  );
  page.emit('console', consoleMessage('warning', 'Failed to load resource', `${ORIGIN}/x.png`));
  page.emit('console', consoleMessage('error', 'something else'));
  page.emit('console', consoleMessage('error', 'app failed', `${ORIGIN}/main.js`, 12));
  assert.deepEqual(errors, [
    'boom',
    'Failed to load resource: the server responded with a status of 404 (Not Found)（/icons/a.png:0）',
    'something else',
    'app failed（/main.js:12）'
  ]);
});

test('collectPageErrors：登记过的同源失败不记，登记在收集之后也生效（列表是共享的）', () => {
  const page = new EventEmitter();
  const errors = [];
  const expected = [];
  collectPageErrors(page, { errors, origin: ORIGIN, engine: 'chromium', expected });
  const abort = url => ({
    type: () => 'error',
    text: () => 'Failed to load resource: net::ERR_FAILED',
    location: () => ({ url, lineNumber: 0 })
  });
  page.emit('console', abort(`${ORIGIN}/chunk.js`));
  expected.push(`${ORIGIN}/chunk.js`);
  page.emit('console', abort(`${ORIGIN}/chunk.js`));
  assert.equal(errors.length, 1);
});
