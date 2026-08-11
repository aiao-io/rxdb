import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { mergeCoverageDirectories, mergeJunitFiles } from './merge-vitest-reports.mjs';

const coverageFile = (path, statementCount) => ({
  path,
  statementMap: {
    0: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
    1: { start: { line: 2, column: 0 }, end: { line: 2, column: 1 } }
  },
  fnMap: {},
  branchMap: {},
  s: { 0: statementCount, 1: 0 },
  f: {},
  b: {},
  meta: { lastBranch: 0, lastFunction: 0, lastStatement: 2, seen: {} }
});

test('合并 coverage 时按文件保留 union 并累加命中次数', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vitest-merge-'));
  const nodeDir = join(root, 'node');
  const browserDir = join(root, 'browser');
  const outputDir = join(root, 'merged');
  await Promise.all([mkdir(nodeDir), mkdir(browserDir)]);
  await writeFile(
    join(nodeDir, 'coverage-final.json'),
    JSON.stringify({
      '/workspace/src/shared.ts': coverageFile('/workspace/src/shared.ts', 1),
      '/workspace/src/node-only.ts': coverageFile('/workspace/src/node-only.ts', 1)
    })
  );
  await writeFile(
    join(browserDir, 'coverage-final.json'),
    JSON.stringify({
      '/workspace/src/shared.ts': coverageFile('/workspace/src/shared.ts', 2),
      '/workspace/src/browser-only.ts': coverageFile('/workspace/src/browser-only.ts', 1)
    })
  );

  const summary = await mergeCoverageDirectories(nodeDir, browserDir, outputDir);
  assert.equal(summary.total.statements.total, 6);
  assert.equal(summary.total.statements.covered, 3);
  const merged = JSON.parse(await readFile(join(outputDir, 'coverage-final.json'), 'utf8'));
  assert.deepEqual(Object.keys(merged).sort(), [
    '/workspace/src/browser-only.ts',
    '/workspace/src/node-only.ts',
    '/workspace/src/shared.ts'
  ]);
  assert.equal(merged['/workspace/src/shared.ts'].s['0'], 3);
});

test('合并 branch coverage 时逐槽累加数组，不把数组强转成字符串', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vitest-branch-merge-'));
  const nodeDir = join(root, 'node');
  const browserDir = join(root, 'browser');
  const outputDir = join(root, 'merged');
  await Promise.all([mkdir(nodeDir), mkdir(browserDir)]);
  const node = coverageFile('/workspace/src/shared.ts', 1);
  const browser = coverageFile('/workspace/src/shared.ts', 0);
  node.branchMap = { 0: { locations: [] } };
  browser.branchMap = { 0: { locations: [] } };
  node.b = { 0: [1, 0] };
  browser.b = { 0: [0, 2] };
  await writeFile(join(nodeDir, 'coverage-final.json'), JSON.stringify({ [node.path]: node }));
  await writeFile(join(browserDir, 'coverage-final.json'), JSON.stringify({ [browser.path]: browser }));

  const summary = await mergeCoverageDirectories(nodeDir, browserDir, outputDir);
  const merged = JSON.parse(await readFile(join(outputDir, 'coverage-final.json'), 'utf8'));
  assert.deepEqual(merged['/workspace/src/shared.ts'].b['0'], [1, 2]);
  assert.equal(summary.total.branches.total, 2);
  assert.equal(summary.total.branches.covered, 2);
});

test('合并 JUnit 时保留两份 testsuite 并汇总根统计', async () => {
  const root = await mkdtemp(join(tmpdir(), 'junit-merge-'));
  const nodeFile = join(root, 'node.xml');
  const browserFile = join(root, 'browser.xml');
  const outputFile = join(root, 'merged.xml');
  await writeFile(
    nodeFile,
    '<?xml version="1.0"?><testsuites tests="2" failures="1" errors="0" time="0.4"><testsuite name="node" tests="2" failures="1" errors="0" time="0.4"></testsuite></testsuites>'
  );
  await writeFile(
    browserFile,
    '<?xml version="1.0"?><testsuites tests="3" failures="0" errors="1" time="0.6"><testsuite name="browser" tests="3" failures="0" errors="1" time="0.6"></testsuite></testsuites>'
  );

  await mergeJunitFiles(nodeFile, browserFile, outputFile);
  const merged = await readFile(outputFile, 'utf8');
  assert.match(merged, /<testsuites[^>]*tests="5"/);
  assert.match(merged, /failures="1"/);
  assert.match(merged, /errors="1"/);
  assert.match(merged, /<testsuite name="node"/);
  assert.match(merged, /<testsuite name="browser"/);
});
