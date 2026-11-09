import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { mergeCoverageDirectories, mergeJunitFiles } from './merge-vitest-reports.mjs';

const loc = (line, startColumn, endColumn) => ({
  start: { line, column: startColumn },
  end: { line, column: endColumn }
});

const writeReports = async (prefix, node, browser) => {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const nodeDir = join(root, 'node');
  const browserDir = join(root, 'browser');
  await Promise.all([mkdir(nodeDir), mkdir(browserDir)]);
  await writeFile(join(nodeDir, 'coverage-final.json'), JSON.stringify({ [node.path]: node }));
  await writeFile(join(browserDir, 'coverage-final.json'), JSON.stringify({ [browser.path]: browser }));
  return { root, nodeDir, browserDir, outputDir: join(root, 'merged') };
};

const fileCoverage = parts => ({
  path: '/workspace/src/shared.ts',
  statementMap: {},
  fnMap: {},
  branchMap: {},
  s: {},
  f: {},
  b: {},
  ...parts
});

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
  const branch = { type: 'if', loc: loc(1, 0, 1), locations: [loc(1, 0, 1), loc(1, 0, 1)], line: 1 };
  node.branchMap = { 0: branch };
  browser.branchMap = { 0: branch };
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

test('同一文件两份报告的计数 ID 指向不同位置时，按源位置合并、重新编号', async () => {
  const fn = (name, line) => ({ name, decl: loc(line, 9, 12), loc: loc(line, 0, 20), line });
  const branch = line => ({ type: 'if', loc: loc(line, 2, 30), locations: [loc(line, 2, 30), loc(line, 2, 30)], line });
  const node = fileCoverage({
    statementMap: { 0: loc(1, 0, 10), 1: loc(2, 0, 10) },
    s: { 0: 1, 1: 0 },
    fnMap: { 0: fn('one', 1), 1: fn('two', 2) },
    f: { 0: 1, 1: 0 },
    branchMap: { 0: branch(1), 1: branch(2) },
    b: { 0: [1, 0], 1: [0, 0] }
  });
  const browser = fileCoverage({
    statementMap: { 0: loc(2, 0, 10), 1: loc(1, 0, 10) },
    s: { 0: 1, 1: 0 },
    fnMap: { 0: fn('two', 2), 1: fn('one', 1) },
    f: { 0: 1, 1: 0 },
    branchMap: { 0: branch(2), 1: branch(1) },
    b: { 0: [0, 3], 1: [0, 0] }
  });
  const dirs = await writeReports('vitest-merge-ids-', node, browser);
  try {
    const summary = await mergeCoverageDirectories(dirs.nodeDir, dirs.browserDir, dirs.outputDir);
    assert.deepEqual(
      ['lines', 'statements', 'functions', 'branches'].map(key => [
        summary.total[key].covered,
        summary.total[key].total
      ]),
      [
        [2, 2],
        [2, 2],
        [2, 2],
        [2, 4]
      ]
    );
    const merged = JSON.parse(await readFile(join(dirs.outputDir, 'coverage-final.json'), 'utf8'))[node.path];
    const hitsAt = (map, hits, key, line) => hits[Object.keys(map).find(id => key(map[id]).start.line === line)];
    assert.equal(
      hitsAt(merged.statementMap, merged.s, item => item, 2),
      1
    );
    assert.equal(
      hitsAt(merged.fnMap, merged.f, item => item.loc, 2),
      1
    );
    assert.deepEqual(
      hitsAt(merged.branchMap, merged.b, item => item.loc, 2),
      [0, 3]
    );
    assert.deepEqual(Object.keys(merged.statementMap), ['0', '1']);
  } finally {
    await rm(dirs.root, { recursive: true, force: true });
  }
});

test('一侧多出一条语句（后续 ID 整体错位）时，同位置相加，多出的语句借另一侧最近包含它的语句计数', async () => {
  const node = fileCoverage({ statementMap: { 0: loc(1, 0, 40), 1: loc(2, 0, 10) }, s: { 0: 2, 1: 0 } });
  const browser = fileCoverage({
    statementMap: { 0: loc(1, 0, 40), 1: loc(1, 20, 30), 2: loc(2, 0, 10) },
    s: { 0: 0, 1: 0, 2: 1 }
  });
  const dirs = await writeReports('vitest-merge-shift-', node, browser);
  try {
    const summary = await mergeCoverageDirectories(dirs.nodeDir, dirs.browserDir, dirs.outputDir);
    assert.equal(summary.total.statements.total, 3);
    assert.equal(summary.total.statements.covered, 3);
    const merged = JSON.parse(await readFile(join(dirs.outputDir, 'coverage-final.json'), 'utf8'))[node.path];
    const byLocation = Object.fromEntries(
      Object.entries(merged.statementMap).map(([id, item]) => [`${item.start.line}:${item.start.column}`, merged.s[id]])
    );
    assert.deepEqual(byLocation, { '1:0': 2, '1:20': 2, '2:0': 1 });
  } finally {
    await rm(dirs.root, { recursive: true, force: true });
  }
});

test('CLI 在带空格的路径下照常合并；输入缺失时非零退出', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vitest-merge-cli-'));
  const scripts = join(root, 'repo dir', 'scripts');
  try {
    await mkdir(scripts, { recursive: true });
    await Promise.all(
      ['merge-vitest-reports.mjs', 'coverage-artifacts.mjs'].map(file =>
        copyFile(join(import.meta.dirname, file), join(scripts, file))
      )
    );
    const node = fileCoverage({ statementMap: { 0: loc(1, 0, 10) }, s: { 0: 1 } });
    const dirs = await writeReports('vitest-merge-cli-input-', node, fileCoverage({ ...node, s: { 0: 0 } }));
    const junit = '<?xml version="1.0"?><testsuites tests="1" failures="0" errors="0" time="0.1"></testsuites>';
    await Promise.all([dirs.nodeDir, dirs.browserDir].map(dir => writeFile(join(dir, 'junit.xml'), junit)));
    const run = (...args) =>
      spawnSync(process.execPath, [join(scripts, 'merge-vitest-reports.mjs'), ...args], { encoding: 'utf8' });

    const merged = run(`--node=${dirs.nodeDir}`, `--browser=${dirs.browserDir}`, `--output=${dirs.outputDir}`);
    assert.equal(merged.status, 0, merged.stderr);
    const summary = JSON.parse(await readFile(join(dirs.outputDir, 'coverage-summary.json'), 'utf8'));
    assert.equal(summary.total.statements.covered, 1);
    assert.match(await readFile(join(dirs.outputDir, 'junit.xml'), 'utf8'), /tests="2"/);

    const missing = run(`--node=${join(root, 'nope')}`, `--browser=${dirs.browserDir}`, `--output=${dirs.outputDir}`);
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /ENOENT/);
    await rm(dirs.root, { recursive: true, force: true });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
