import assert from 'node:assert/strict';
import test from 'node:test';

import { EXPECTED_CHECKS, failureReasons, isPassed, recordConsoleError } from './aiao-code-report.mjs';

const DESKTOP = 'https://desktop.aiao.io';
const VSCODE = 'https://vscode.aiao.io';

const passingReport = () => ({
  error: undefined,
  checks: Object.fromEntries(Array.from({ length: EXPECTED_CHECKS }, (_, index) => [`check${index}`, true])),
  desktopErrors: [],
  appConsoleErrors: [],
  appPageErrors: []
});

test('控制台错误按来源分栏：桌面自己来源的（包括资源加载失败）算桌面错误，其余算应用控制台错误', () => {
  const report = passingReport();
  recordConsoleError(report, { text: 'TypeError: boom', url: `${DESKTOP}/main-ABC.js` }, DESKTOP);
  recordConsoleError(
    report,
    { text: 'Failed to load resource: the server responded with a status of 404 ()', url: `${DESKTOP}/icons/a.png` },
    DESKTOP
  );
  recordConsoleError(report, { text: 'sync failed', url: `${VSCODE}/workbench.js` }, DESKTOP);
  recordConsoleError(
    report,
    { text: 'Failed to load resource: net::ERR_FAILED', url: 'https://tile.example/1.png' },
    DESKTOP
  );
  assert.deepEqual(report.desktopErrors, [
    'TypeError: boom',
    'Failed to load resource: the server responded with a status of 404 ()'
  ]);
  assert.deepEqual(report.appConsoleErrors, [
    `sync failed（${VSCODE}/workbench.js）`,
    'Failed to load resource: net::ERR_FAILED（https://tile.example/1.png）'
  ]);
});

test('没有来源或来源解析不了的控制台错误不能算桌面的，记为应用控制台错误并写明来源未知；过长的文字截断到 300 字', () => {
  const report = passingReport();
  recordConsoleError(report, { text: 'no location', url: '' }, DESKTOP);
  recordConsoleError(report, { text: 'bad location', url: 'not a url' }, DESKTOP);
  recordConsoleError(report, { text: 'x'.repeat(500), url: `${VSCODE}/a.js` }, DESKTOP);
  assert.deepEqual(report.desktopErrors, []);
  assert.equal(report.appConsoleErrors[0], 'no location（来源未知）');
  assert.equal(report.appConsoleErrors[1], 'bad location（not a url）');
  assert.equal(report.appConsoleErrors[2], `${'x'.repeat(300)}（${VSCODE}/a.js）`);
});

test('9 项检查全真、没有任何错误才算通过', () => {
  assert.equal(isPassed(passingReport()), true);
  assert.deepEqual(failureReasons(passingReport()), []);
});

test('应用的控制台错误非空即判失败：验收的对象就是这个应用，不能带着它的 console.error 通过', () => {
  const report = passingReport();
  report.appConsoleErrors.push('sync failed（https://vscode.aiao.io/workbench.js）');
  assert.equal(isPassed(report), false);
  assert.deepEqual(failureReasons(report), [
    '应用有 1 条控制台错误：sync failed（https://vscode.aiao.io/workbench.js）'
  ]);
});

test('其余失败条件不变：运行中断、应用页面错误、检查项数量不对、有检查项为假', () => {
  const interrupted = { ...passingReport(), error: 'Aiao Code 打开失败：timeout' };
  assert.equal(isPassed(interrupted), false);
  assert.deepEqual(failureReasons(interrupted), ['验收中断：Aiao Code 打开失败：timeout']);

  const pageError = { ...passingReport(), appPageErrors: ['Uncaught Error: x'] };
  assert.equal(isPassed(pageError), false);
  assert.deepEqual(failureReasons(pageError), ['应用有 1 条页面错误：Uncaught Error: x']);

  const missing = passingReport();
  delete missing.checks.check0;
  assert.equal(isPassed(missing), false);
  assert.deepEqual(failureReasons(missing), [`检查项应有 ${EXPECTED_CHECKS} 项，实际 ${EXPECTED_CHECKS - 1} 项`]);

  const broken = passingReport();
  broken.checks.check3 = false;
  assert.equal(isPassed(broken), false);
  assert.deepEqual(failureReasons(broken), ['检查项没有通过：check3']);
});

test('检查项数量保持 9：历史验收报告（requirements/evidence）都是 9 项，改它要同步比较口径', () => {
  assert.equal(EXPECTED_CHECKS, 9);
});
