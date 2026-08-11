import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatNxLog, parseArgs, parseNxLog, renderReport, resolveNxExitCode } from './test-all-log.mjs';

const failedLog = `\n\u001B[36m> nx run utils:lint  [existing outputs match the cache, left as is]\u001B[0m\r
\r
\r
> nx run app:build:production\r
app: src/main.ts:12:3 - \u001B[91merror\u001B[0m TS2322: Type mismatch.\r

Tasks not run because their dependencies failed or --nx-bail=true:

- app:test

Failed tasks:

- app:build:production

  Run duration:      3.2s
  Cache:             1/2 hit (50%)
`;

test('formatNxLog 清除控制字符并压缩连续空行', () => {
  const formatted = formatNxLog(failedLog);

  assert.ok(!formatted.includes('\u001B'));
  assert.ok(!formatted.includes('\r'));
  assert.doesNotMatch(formatted, /\n{3}/);
  assert.match(formatted, /> nx run utils:lint/);
});

test('parseNxLog 汇总成功、缓存、失败和跳过任务', () => {
  const result = parseNxLog(formatNxLog(failedLog));

  assert.deepEqual(result, {
    scheduled: 3,
    started: 2,
    succeeded: 1,
    executedSucceeded: 0,
    cached: 1,
    cacheTotal: 2,
    cachePercent: 50,
    failed: ['app:build:production'],
    skipped: ['app:test'],
    flaky: [],
    truncatedLines: 0,
    duration: '3.2s',
    failures: [
      {
        task: 'app:build:production',
        line: 3,
        errorLine: 4,
        error: 'src/main.ts:12:3 - error TS2322: Type mismatch.'
      }
    ]
  });
});

test('parseNxLog 只读取最外层 Nx 指标并提取 flaky 和 Playwright 诊断', () => {
  const log = `> nx run app:e2e
website:   Run duration:      1.4s
website:   Cache:             27/27 hit (100%)
app:   1) [chromium] › src/todo.spec.ts:78:7 › Todo Page › should delete todo ─────
app:     Error: expect(locator).toBeHidden() failed
app:         at /repo/apps/app-e2e/src/todo.spec.ts:104:28
app:     Error Context: test-output/playwright/todo/error-context.md
app:     test-output/playwright/todo/trace.zip

Tasks not run because their dependencies failed or --nx-bail=true:

- other:test

Failed tasks:

- app:e2e

 NX   Nx detected 2 flaky tasks

  utils:typecheck
  rxdb:typecheck

  Run duration:      7m 26s
  Cache:             77/161 hit (48%)
`;

  const result = parseNxLog(log);

  assert.equal(result.duration, '7m 26s');
  assert.equal(result.cached, 77);
  assert.equal(result.cacheTotal, 161);
  assert.equal(result.cachePercent, 48);
  assert.equal(result.scheduled, 2);
  assert.deepEqual(result.flaky, ['utils:typecheck', 'rxdb:typecheck']);
  assert.deepEqual(result.failures[0], {
    task: 'app:e2e',
    line: 1,
    errorLine: 5,
    error: 'Error: expect(locator).toBeHidden() failed',
    test: 'src/todo.spec.ts:78:7 › Todo Page › should delete todo',
    source: '/repo/apps/app-e2e/src/todo.spec.ts:104:28',
    errorContext: 'test-output/playwright/todo/error-context.md',
    trace: 'test-output/playwright/todo/trace.zip'
  });
});

test('formatNxLog 截断无诊断价值的超长单行并保留头尾', () => {
  const payload = 'A'.repeat(10_000);
  const formatted = formatNxLog(`at data:application/wasm;base64,${payload}:wasm-tail\n`);

  assert.ok(formatted.length < 4_200);
  assert.match(formatted, /^at data:application\/wasm;base64,/);
  assert.match(formatted, /\[省略 \d+ 字符\]/);
  assert.match(formatted, /:wasm-tail\n$/);
  assert.equal(formatNxLog(`${payload}\n`, 0), `${payload}\n`);
});

test('renderReport 把结论和失败原因放在详细输出之前', () => {
  const log = formatNxLog(failedLog);
  const report = renderReport({
    code: 1,
    command: 'pnpm exec nx affected -t lint build',
    startedAt: '2026-08-06T03:39:43.000Z',
    result: parseNxLog(log),
    log
  });

  assert.ok(report.search(/状态\s+失败/) < report.indexOf('Nx 详细输出'));
  assert.match(report, /app:build:production/);
  assert.match(report, /首个错误\s+src\/main\.ts:12:3 - error TS2322: Type mismatch\./);
  assert.match(report, /Nx 输出第 4 行/);
  assert.ok(!report.includes('\u001B'));
  assert.ok(!report.includes('\r'));
});

test('parseArgs 支持逗号分隔 target 和原样透传 Nx 参数', () => {
  const options = parseArgs([
    '--targets=lint,test',
    '--parallel=2',
    '--max-line=8192',
    '--',
    '--base=develop',
    '--verbose'
  ]);

  assert.deepEqual(options.targets, ['lint', 'test']);
  assert.equal(options.parallel, 2);
  assert.equal(options.maxLineLength, 8192);
  assert.deepEqual(options.extras, ['--base=develop', '--verbose']);
});

test('parseArgs 拒绝无效的输出模式和并行数', () => {
  assert.throws(() => parseArgs(['--style=tui']), /无效的输出模式/);
  assert.throws(() => parseArgs(['--parallel=0']), /并行数必须是正整数/);
  assert.throws(() => parseArgs(['--max-line=128']), /单行上限/);
});

test('resolveNxExitCode 以 Failed tasks 校正错误的成功退出码', () => {
  const failedResult = parseNxLog(formatNxLog(failedLog));

  assert.equal(resolveNxExitCode(0, failedResult), 1);
  assert.equal(resolveNxExitCode(7, failedResult), 7);
  assert.equal(resolveNxExitCode(0, { ...failedResult, failed: [], failures: [] }), 0);
});
