import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { resultResponse } from './provider-acceptance.mjs';
import { observeResultNetwork } from './provider-result-network.mjs';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = server => `http://127.0.0.1:${server.address().port}`;
const close = server => new Promise(resolve => server.close(resolve));

export async function verifyResultNetworkFixture(bytes) {
  const calls = new Map();
  const results = createServer((request, response) => {
    const path = new URL(request.url, origin(results)).pathname;
    calls.set(path, (calls.get(path) ?? 0) + 1);
    if (path === '/pending') return;
    if (path !== '/cors') response.setHeader('Access-Control-Allow-Origin', '*');
    if (path === '/redirect') return response.writeHead(302, { location: '/redirect-target' }).end();
    response.writeHead(path === '/http-error' ? 403 : 200, { 'content-type': 'image/jpeg' }).end(bytes);
  });
  const app = createServer((request, response) => {
    if (request.url === '/restricted') response.setHeader('Content-Security-Policy', "connect-src 'self'");
    if (request.url === '/report-only') response.setHeader('Content-Security-Policy-Report-Only', "connect-src 'self'");
    response.writeHead(200, { 'content-type': 'text/html' }).end('<!doctype html><title>Network fixture</title>');
  });
  const unavailable = createServer();
  let browser;
  try {
    await listen(results);
    await listen(app);
    await listen(unavailable);
    const refused = `${origin(unavailable)}/refused`;
    await close(unavailable);
    browser = await chromium.launch({ channel: process.env.AIAO_PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
    const cases = [
      { path: '/ok', status: 200 },
      { path: '/cors', code: 'RESULT_CORS_BLOCKED', cors: 'MissingAllowOriginHeader' },
      { path: '/redirect', code: 'RESULT_REDIRECT_BLOCKED' },
      { path: '/http-error', status: 403 },
      { path: '/csp', code: 'RESULT_CSP_BLOCKED', page: 'restricted' },
      { path: '/report-only', status: 200, page: 'report-only' },
      { path: '/refused', code: 'RESULT_REQUEST_FAILED', url: refused, networkError: 'CONNECTION_REFUSED' },
      { path: '/pending', code: 'RESULT_RESPONSE_TIMEOUT', timeout: 200 },
      { path: '/never-requested', code: 'RESULT_REQUEST_NOT_OBSERVED', timeout: 200, skip: true }
    ];
    for (const scenario of cases) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        const session = await context.newCDPSession(page);
        const network = observeResultNetwork(session);
        await session.send('Network.enable');
        await session.send('Audits.enable');
        const responses = new Map();
        page.on('response', response => responses.set(response.url(), response));
        await page.goto(`${origin(app)}/${scenario.page ?? ''}`);
        const url = scenario.url ?? `${origin(results)}${scenario.path}?token=private-fixture-only`;
        if (!scenario.skip)
          await page.evaluate(url => {
            globalThis.networkFixtureController = new AbortController();
            globalThis.networkFixtureResult = fetch(url, {
              credentials: 'omit',
              redirect: 'error',
              referrerPolicy: 'no-referrer',
              signal: globalThis.networkFixtureController.signal
            }).then(
              async response => ({
                status: response.status,
                bytes: Array.from(new Uint8Array(await response.arrayBuffer()))
              }),
              () => ({ failed: true })
            );
          }, url);
        const record = {};
        if (scenario.code)
          await assert.rejects(
            resultResponse(url, responses, network, record, scenario.timeout),
            error => error.message === scenario.code,
            scenario.path + ' ' + JSON.stringify(record)
          );
        else {
          const response = await resultResponse(url, responses, network, record);
          assert.equal(response.status(), scenario.status);
          const result = await page.evaluate(() => globalThis.networkFixtureResult);
          assert.equal(result.status, scenario.status);
          assert.deepEqual(Buffer.from(result.bytes), bytes);
        }
        if (scenario.cors) assert.equal(record.resultRequest.corsError, scenario.cors);
        if (scenario.networkError) assert.equal(record.resultRequest.networkError, scenario.networkError);
        assert.ok(!JSON.stringify(record).includes('private'));
        assert.ok(!JSON.stringify(record).includes('127.0.0.1'));
        await page.evaluate(() => globalThis.networkFixtureController?.abort());
      } finally {
        await context.close();
      }
    }
    assert.equal(calls.get('/redirect-target') ?? 0, 0);
    assert.equal(calls.get('/csp') ?? 0, 0);
    assert.equal(calls.get('/never-requested') ?? 0, 0);
    for (const path of ['/ok', '/cors', '/redirect', '/http-error', '/report-only', '/pending'])
      assert.equal(calls.get(path), 1);
    console.log(
      '9 个真实 Chromium 原图网络场景通过：成功、CORS、拒绝重定向、HTTP 错误、强制 CSP、仅报告 CSP、连接拒绝、响应超时和未发请求；无重试。'
    );
  } finally {
    await browser?.close();
    await close(app);
    results.closeAllConnections();
    await close(results);
    if (unavailable.listening) await close(unavailable);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const bytes = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#b74e28' } })
    .jpeg()
    .toBuffer();
  await verifyResultNetworkFixture(bytes);
}
