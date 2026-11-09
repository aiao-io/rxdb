import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { listReports } from './coverage-serve.mjs';

const SUMMARY = JSON.stringify({
  total: Object.fromEntries(
    ['statements', 'branches', 'functions', 'lines'].map(key => [key, { total: 10, covered: 9, skipped: 0, pct: 90 }])
  )
});

function createCoverageFixture(t) {
  const coverageDir = mkdtempSync(join(tmpdir(), 'coverage-serve-'));
  t.after(() => rmSync(coverageDir, { recursive: true, force: true }));
  for (const name of ['alpha', 'beta']) {
    const dir = join(coverageDir, 'packages', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), '<!doctype html>');
    writeFileSync(join(dir, 'coverage-summary.json'), SUMMARY);
  }
  return coverageDir;
}

/** 让指定路径在 fs 某个同步 API 上表现为「刚被删掉」，模拟 vitest 正在清理重建报告目录。 */
function vanishOn(t, method, target, code = 'ENOENT') {
  const original = fs[method];
  fs[method] = (path, ...rest) => {
    if (String(path) === target) throw Object.assign(new Error(`${code}: injected ${method}`), { code });
    return original(path, ...rest);
  };
  syncBuiltinESMExports();
  t.after(() => {
    fs[method] = original;
    syncBuiltinESMExports();
  });
}

// 首页每次请求都现扫 coverage/：vitest 重跑会清理重建输出目录，某个包目录可能在 readdir 之后、stat 之前消失。
// 异常一旦逃出请求回调，整个本地服务退出，浏览器只看到连接被重置。
test('报告目录在列出之后消失（ENOENT）时跳过该项，其余报告照常列出', t => {
  const coverageDir = createCoverageFixture(t);
  vanishOn(t, 'statSync', join(coverageDir, 'packages', 'beta'));

  assert.deepEqual(
    listReports(coverageDir).map(report => report.id),
    ['alpha']
  );
});

test('报告目录被换成文件（ENOTDIR）时同样跳过', t => {
  const coverageDir = createCoverageFixture(t);
  vanishOn(t, 'statSync', join(coverageDir, 'packages', 'alpha'), 'ENOTDIR');

  assert.deepEqual(
    listReports(coverageDir).map(report => report.id),
    ['beta']
  );
});

test('分组目录在检查之后被整体删掉时返回空列表，不抛错', t => {
  const coverageDir = createCoverageFixture(t);
  vanishOn(t, 'readdirSync', join(coverageDir, 'packages'));

  assert.deepEqual(listReports(coverageDir), []);
});

test('读不到目录的其他错误照常抛出，不被当成「没有报告」', t => {
  const coverageDir = createCoverageFixture(t);
  vanishOn(t, 'statSync', join(coverageDir, 'packages', 'beta'), 'EACCES');

  assert.throws(() => listReports(coverageDir), /EACCES/);
});
