import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectEntrypoints } from './inspect-live.mjs';

const targets = ['https://old.example', 'https://new.example'];
const requiredHeaders = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' };
const response = (body = 'desktop', init = {}) => new Response(body, { status: 200, headers: requiredHeaders, ...init });

test('两个入口内容一致、状态与跨源隔离头完整才通过', async () => {
  const report = await inspectEntrypoints({ targets, requiredHeaders, fetchImpl: async () => response() });
  assert.equal(report.passed, true);
  assert.equal(report.entries.length, 2);
  assert.equal(report.entries[0].sha256, report.entries[1].sha256);
});

test('入口内容不同不能当成同一部署', async () => {
  const report = await inspectEntrypoints({ targets, requiredHeaders, fetchImpl: async url => response(url) });
  assert.equal(report.passed, false);
  assert.equal(report.sameEntrypoint, false);
});

test('重定向不跟随，响应头缺失和网络错误均保留具体地址', async () => {
  for (const fetchImpl of [
    async (_, init) => { assert.equal(init.redirect, 'manual'); return response('', { status: 302, headers: { Location: targets[0] } }); },
    async () => response('desktop', { headers: {} }),
    async () => { throw new Error('network unavailable'); }
  ]) {
    const report = await inspectEntrypoints({ targets, requiredHeaders, fetchImpl });
    assert.equal(report.passed, false);
    assert.equal(report.entries[0].url, targets[0]);
    assert.ok(report.entries[0].problems.length > 0);
  }
});
