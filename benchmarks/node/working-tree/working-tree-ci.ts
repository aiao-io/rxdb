import { execFileSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { aggregateWorkingTreeReports, WORKING_TREE_CI_ATTEMPTS } from './working-tree-ci-report.ts';
import { collectEnvironment, decideRelativeGate, readReferences, selectReference } from './working-tree-gate.ts';
import type { WorkingTreeBenchReport } from './working-tree-report.ts';
import { ENVIRONMENT_MISMATCH_CODE, LATEST_PATH, REFERENCE_DIR } from './working-tree-report.ts';

const environment = collectEnvironment();
const references = await readReferences(REFERENCE_DIR);
const reference = selectReference(references, environment.ratioProfile);
if (reference === null) {
  throw new Error(`${ENVIRONMENT_MISMATCH_CODE}: ${environment.ratioProfile}`);
}

const reports: WorkingTreeBenchReport[] = [];
const benchmarkScript = fileURLToPath(new URL('./working-tree.bench.ts', import.meta.url));
for (let attempt = 1; attempt <= WORKING_TREE_CI_ATTEMPTS; attempt++) {
  console.log(`\n[bench:working-tree-ci] 独立运行 ${attempt}/${WORKING_TREE_CI_ATTEMPTS}`);
  await rm(LATEST_PATH, { force: true });
  execFileSync(process.execPath, ['--experimental-strip-types', benchmarkScript, '--no-gate'], { stdio: 'inherit' });
  const report: WorkingTreeBenchReport = JSON.parse(await readFile(LATEST_PATH, 'utf8'));
  if (
    report.environment.runnerProfileHash !== environment.runnerProfileHash ||
    JSON.stringify(report.reference) !== JSON.stringify(reference)
  ) {
    throw new Error('子进程 runner 画像或 reference 与 CI 入口不一致');
  }
  reports.push(report);
}

const report = aggregateWorkingTreeReports(reports);
await writeFile(LATEST_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const decision = decideRelativeGate([reference], environment.ratioProfile, report.measurements);
if (decision.kind !== 'evaluated') throw new Error(`${ENVIRONMENT_MISMATCH_CODE}: ${environment.ratioProfile}`);

for (const [index, verdict] of decision.verdicts.entries()) {
  const attempts = reports.map(attempt => attempt.measurements[index].ratio);
  console.log(
    `[bench:working-tree-ci] ${verdict.id}: attempts=${attempts.join(', ')} median=${verdict.ratio.toFixed(3)} budget=${verdict.budget} ${verdict.passed ? 'PASS' : 'FAIL'}`
  );
}
console.log(`[bench:working-tree-ci] 总判定：${decision.passed ? 'PASS' : 'FAIL'}`);
if (!decision.passed) process.exitCode = 1;
