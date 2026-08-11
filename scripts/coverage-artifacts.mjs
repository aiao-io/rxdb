import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const METRICS = ['statements', 'branches', 'functions', 'lines'];

const countCovered = values => values.filter(value => value > 0).length;

const emptyCounts = () => Object.fromEntries(METRICS.map(metric => [metric, { total: 0, covered: 0 }]));

/** 从 Istanbul coverage-final.json 重算四项原始计数。 */
export function coverageCountsFromFinal(coverage) {
  const totals = emptyCounts();

  for (const file of Object.values(coverage)) {
    const statements = Object.values(file.s ?? {});
    const functions = Object.values(file.f ?? {});
    const branches = Object.values(file.b ?? {}).flat();
    const lines = new Map();

    for (const [id, location] of Object.entries(file.statementMap ?? {})) {
      const line = location.start.line;
      lines.set(line, Math.max(lines.get(line) ?? 0, file.s?.[id] ?? 0));
    }

    totals.statements.total += statements.length;
    totals.statements.covered += countCovered(statements);
    totals.functions.total += functions.length;
    totals.functions.covered += countCovered(functions);
    totals.branches.total += branches.length;
    totals.branches.covered += countCovered(branches);
    totals.lines.total += lines.size;
    totals.lines.covered += countCovered([...lines.values()]);
  }

  return totals;
}

/** coverage-summary.json 必须与 coverage-final.json 的原始计数完全一致。 */
export function assertCoverageSummaryMatchesFinal(coverage, summary) {
  const calculated = coverageCountsFromFinal(coverage);

  for (const metric of METRICS) {
    const reported = summary.total?.[metric];
    const actual = calculated[metric];
    if (reported?.total === actual.total && reported?.covered === actual.covered) continue;
    throw new Error(
      `${metric} coverage 计数不一致：summary=${String(reported?.total)}/${String(reported?.covered)} ` +
        `final=${String(actual.total)}/${String(actual.covered)}`
    );
  }
}

const fingerprint = path => {
  const stat = statSync(path, { bigint: true });
  return `${String(stat.dev)}:${String(stat.ino)}:${String(stat.size)}:${String(stat.mtimeNs)}`;
};

const parseJson = (path, content) => {
  try {
    return JSON.parse(content);
  } catch (cause) {
    throw new Error(`无法解析 coverage 产物 ${path}`, { cause });
  }
};

/**
 * 读取同一稳定快照；写入中的文件或跨代 summary/final 都会让门禁失败。
 * summary 是提交点，因此发布顺序固定为 final → summary。
 */
export function readVerifiedCoverageTotals(summaryPath, options = {}) {
  const finalPath = join(dirname(summaryPath), 'coverage-final.json');
  const hasFinal = existsSync(finalPath);
  if (options.requireFinal && !hasFinal) throw new Error(`缺少 coverage-final.json：${finalPath}`);

  const summaryBefore = fingerprint(summaryPath);
  const finalBefore = hasFinal ? fingerprint(finalPath) : null;
  const summaryContent = readFileSync(summaryPath, 'utf8');
  const finalContent = hasFinal ? readFileSync(finalPath, 'utf8') : null;
  const summaryAfter = fingerprint(summaryPath);
  const finalAfter = hasFinal ? fingerprint(finalPath) : null;

  if (summaryBefore !== summaryAfter || finalBefore !== finalAfter) {
    throw new Error(`coverage 产物在读取期间发生变化：${dirname(summaryPath)}`);
  }

  const summary = parseJson(summaryPath, summaryContent);
  if (finalContent !== null) {
    assertCoverageSummaryMatchesFinal(parseJson(finalPath, finalContent), summary);
  }

  return Object.fromEntries(
    METRICS.map(metric => {
      const value = summary.total?.[metric]?.pct;
      if (typeof value !== 'number') throw new Error(`summary 缺少 total.${metric}.pct`);
      return [metric, value];
    })
  );
}

/** 通过同目录临时文件 + rename 发布单个完整文件。 */
export async function writeFileAtomically(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${String(process.pid)}.${randomUUID()}.tmp`;
  let handle;

  try {
    handle = await open(temporaryPath, 'wx');
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, path);
  } finally {
    await handle?.close();
    await rm(temporaryPath, { force: true });
  }
}

/** 校验后按 final → summary 顺序发布；中断留下的跨代文件对会被读取门禁拒绝。 */
export async function writeValidatedCoveragePair(outputDir, coverage, summary) {
  assertCoverageSummaryMatchesFinal(coverage, summary);
  const finalContent = `${JSON.stringify(coverage)}\n`;
  const summaryContent = `${JSON.stringify(summary, null, 2)}\n`;

  await writeFileAtomically(join(outputDir, 'coverage-final.json'), finalContent);
  await writeFileAtomically(join(outputDir, 'coverage-summary.json'), summaryContent);
}
