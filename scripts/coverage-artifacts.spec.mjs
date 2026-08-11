import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  assertCoverageSummaryMatchesFinal,
  readVerifiedCoverageTotals,
  writeValidatedCoveragePair
} from './coverage-artifacts.mjs';
import AtomicCoverageReporter from './coverage-atomic-reporter.mjs';

const execFileAsync = promisify(execFile);
const workspaceRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const vitestCli = join(workspaceRoot, 'node_modules/vitest/vitest.mjs');

const coverageFile = (covered = 1) => ({
  path: '/workspace/src/example.ts',
  statementMap: {
    0: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } }
  },
  fnMap: {},
  branchMap: {},
  s: { 0: covered },
  f: {},
  b: {}
});

const summary = (statementTotal = 1) => ({
  total: {
    lines: { total: 1, covered: 1, skipped: 0, pct: 100 },
    statements: { total: statementTotal, covered: 1, skipped: 0, pct: 100 },
    functions: { total: 0, covered: 0, skipped: 0, pct: 100 },
    branches: { total: 0, covered: 0, skipped: 0, pct: 100 }
  }
});

test('拒绝 coverage-summary 与 coverage-final 计数不一致', () => {
  assert.throws(
    () => assertCoverageSummaryMatchesFinal({ example: coverageFile() }, summary(2)),
    /statements.*summary=2\/1.*final=1\/1/
  );
});

test('校验失败时保留上一份完整 coverage 报告', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'aiao-coverage-artifacts-'));
  const finalPath = join(outputDir, 'coverage-final.json');
  const summaryPath = join(outputDir, 'coverage-summary.json');
  await Promise.all([writeFile(finalPath, 'previous-final\n'), writeFile(summaryPath, 'previous-summary\n')]);

  await assert.rejects(() => writeValidatedCoveragePair(outputDir, { example: coverageFile() }, summary(2)));

  assert.equal(await readFile(finalPath, 'utf8'), 'previous-final\n');
  assert.equal(await readFile(summaryPath, 'utf8'), 'previous-summary\n');
  assert.deepEqual((await readdir(outputDir)).sort(), ['coverage-final.json', 'coverage-summary.json']);
});

test('只接受可解析且自洽的 coverage 文件对', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'aiao-coverage-verify-'));
  await writeValidatedCoveragePair(outputDir, { example: coverageFile() }, summary());

  assert.deepEqual(readVerifiedCoverageTotals(join(outputDir, 'coverage-summary.json'), { requireFinal: true }), {
    lines: 100,
    statements: 100,
    functions: 100,
    branches: 100
  });
  assert.deepEqual((await readdir(outputDir)).sort(), ['coverage-final.json', 'coverage-summary.json']);
});

test('Vitest coverage reporter 原子发布 final 与 summary', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'aiao-coverage-reporter-'));
  const reporter = new AtomicCoverageReporter({ outputDir });
  const finalPath = join(outputDir, 'coverage-final.json');
  const summaryPath = join(outputDir, 'coverage-summary.json');

  await reporter.onCoverage({
    toJSON: () => ({ example: coverageFile() }),
    getCoverageSummary: () => ({ toJSON: () => summary().total })
  });
  await Promise.all([
    assert.rejects(() => readFile(finalPath), { code: 'ENOENT' }),
    assert.rejects(() => readFile(summaryPath), { code: 'ENOENT' })
  ]);
  await Promise.all([writeFile(finalPath, '{}\n'), writeFile(summaryPath, '{}\n')]);
  await reporter.onFinishedReportCoverage();

  assert.deepEqual(readVerifiedCoverageTotals(summaryPath, { requireFinal: true }), {
    lines: 100,
    statements: 100,
    functions: 100,
    branches: 100
  });
});

test('真实 Vitest 只为成功运行发布 coverage 文件对', async () => {
  const scenarioDir = await mkdtemp(join(tmpdir(), 'aiao-vitest-coverage-lifecycle-'));
  const coverageDir = join(scenarioDir, 'coverage');
  const reporterPath = fileURLToPath(new URL('./coverage-atomic-reporter.mjs', import.meta.url));
  const configPath = join(scenarioDir, 'vitest.config.mjs');
  const specPath = join(scenarioDir, 'source.spec.js');

  await Promise.all([
    writeFile(join(scenarioDir, 'source.js'), 'export const value = 1;\n'),
    writeFile(
      configPath,
      `export default ${JSON.stringify({
        test: {
          globals: true,
          include: ['source.spec.js'],
          reporters: [[reporterPath, { outputDir: coverageDir }]],
          coverage: {
            enabled: true,
            provider: 'v8',
            reporter: ['text'],
            reportsDirectory: coverageDir,
            include: ['source.js']
          }
        }
      })};\n`
    ),
    writeFile(
      specPath,
      "import { value } from './source.js';\ntest('coverage lifecycle', () => expect(value).toBe(2));\n"
    )
  ]);

  await assert.rejects(() =>
    execFileAsync(process.execPath, [vitestCli, 'run', '--config', configPath], { cwd: scenarioDir })
  );
  await Promise.all([
    assert.rejects(() => readFile(join(coverageDir, 'coverage-final.json')), { code: 'ENOENT' }),
    assert.rejects(() => readFile(join(coverageDir, 'coverage-summary.json')), { code: 'ENOENT' })
  ]);

  await writeFile(
    specPath,
    "import { value } from './source.js';\ntest('coverage lifecycle', () => expect(value).toBe(1));\n"
  );
  await execFileAsync(process.execPath, [vitestCli, 'run', '--config', configPath], { cwd: scenarioDir });

  assert.deepEqual(readVerifiedCoverageTotals(join(coverageDir, 'coverage-summary.json'), { requireFinal: true }), {
    lines: 100,
    statements: 100,
    functions: 100,
    branches: 100
  });
});

test('CI 同时产出 final 与 summary 供一致性门禁校验', async () => {
  const workflow = await readFile(new URL('../.github/workflows/test-template.yml', import.meta.url), 'utf8');
  assert.match(workflow, /--coverage\.reporter=json(?:\s|\\)/);
  assert.match(workflow, /--coverage\.reporter=json-summary/);
});
