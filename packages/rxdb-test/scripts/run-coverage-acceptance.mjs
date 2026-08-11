import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const packageRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '../..');
// blob 中转目录放 os.tmpdir()，不放包内（SQLC-039）：下面两处 rmSync 会整个删掉它，
// 落在包内就会把同路径下任何被跟踪文件标成已删除，中断的运行还会留下半截 blob。
// realpath 归一：macOS 的 /var → /private/var，否则 --mergeReports 的路径与 blob 内记录对不上。
const acceptanceRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'aiao-rxdb-test-acceptance-')));
// 三段 run 共用这一个 blobsRoot：前两段各写一份 blob，最后一段靠 --mergeReports 读回来。
const blobsRoot = path.join(acceptanceRoot, 'blobs');
const outputRoot = path.join(workspaceRoot, 'coverage/packages/rxdb-test');
const vitestRoot = path.dirname(require.resolve('vitest/package.json'));
const vitestBin = path.join(vitestRoot, 'vitest.mjs');
const threshold = 80;
const metrics = ['statements', 'branches', 'functions', 'lines'];
// 本包发布出去、只由适配器执行的共享套件。每一条都必须在合并后的报告里出现且只出现一次 ——
// 出现 0 次说明没有任何适配器 spec 在跑它（分母被稀释成永远填不满的死代码），
// 出现多次说明 source-map 归并出了重影。列表要与两段 run 的 include 保持同步（RXT-030）。
const suiteFiles = [
  'src/encrypted/crud.suite.ts',
  'src/encrypted/lifecycle.suite.ts',
  'src/encrypted/tamper.suite.ts',
  'src/encrypted/change-log.suite.ts',
  'src/encrypted/bigint-binary.suite.ts',
  'src/transaction/bootstrap.suite.ts',
  'src/transaction/isolation.suite.ts',
  'src/transaction/readiness.suite.ts',
  'src/tree-unique/sibling-unique.suite.ts'
];
// 分母：`src` 之外，`entities` / `shop` 也是发布产物，同等计入（RXT-030）。
const productionRoots = ['src', 'entities', 'shop'];

function runVitest(args) {
  const result = spawnSync(process.execPath, [vitestBin, ...args], {
    cwd: packageRoot,
    env: { ...process.env, AIAO_ACCEPTANCE_ROOT: acceptanceRoot },
    stdio: 'inherit'
  });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Vitest failed with exit code ${String(result.status)}`);
}

function collectProductionFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectProductionFiles(absolutePath);
    if (!entry.name.endsWith('.ts')) return [];
    if (/\.(?:spec|test)\.ts$/.test(entry.name)) return [];
    return [realpathSync(absolutePath)];
  });
}

function toCanonicalPath(coverageKey) {
  const filePath = coverageKey.startsWith('file:') ? fileURLToPath(coverageKey) : coverageKey;
  return realpathSync(filePath);
}

function verifyCanonicalCoverage() {
  const finalPath = path.join(outputRoot, 'coverage-final.json');
  const summaryPath = path.join(outputRoot, 'coverage-summary.json');
  const coverage = JSON.parse(readFileSync(finalPath, 'utf8'));
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const coverageKeys = Object.keys(coverage);
  const canonicalGroups = Map.groupBy(coverageKeys, toCanonicalPath);
  const duplicateGroups = [...canonicalGroups].filter(([, keys]) => keys.length !== 1);

  if (duplicateGroups.length > 0) {
    const details = duplicateGroups.map(([canonical, keys]) => `${canonical}: ${keys.join(', ')}`).join('\n');
    throw new Error(`Duplicate source-map coverage keys detected:\n${details}`);
  }

  const expectedFiles = productionRoots.flatMap(root => collectProductionFiles(path.join(packageRoot, root))).sort();
  const actualFiles = [...canonicalGroups.keys()].sort();
  const missingFiles = expectedFiles.filter(file => !canonicalGroups.has(file));
  const unexpectedFiles = actualFiles.filter(file => !expectedFiles.includes(file));

  if (missingFiles.length > 0) throw new Error(`Missing production coverage keys:\n${missingFiles.join('\n')}`);
  if (unexpectedFiles.length > 0) throw new Error(`Unexpected coverage keys:\n${unexpectedFiles.join('\n')}`);

  const suiteKeys = Object.fromEntries(
    suiteFiles.map(file => {
      const canonical = realpathSync(path.join(packageRoot, file));
      return [file, canonicalGroups.get(canonical) ?? []];
    })
  );

  if (Object.values(suiteKeys).some(keys => keys.length !== 1)) {
    throw new Error(`Shared suite canonical key validation failed: ${JSON.stringify(suiteKeys)}`);
  }

  const totals = Object.fromEntries(
    metrics.map(metric => {
      const value = summary.total?.[metric];
      if (typeof value?.pct !== 'number' || value.pct < threshold) {
        throw new Error(`${metric} coverage ${String(value?.pct)}% is below ${String(threshold)}%`);
      }
      return [metric, value];
    })
  );

  const outputEntries = readdirSync(outputRoot).sort();
  const expectedOutputs = ['coverage-final.json', 'coverage-summary.json'];
  if (JSON.stringify(outputEntries) !== JSON.stringify(expectedOutputs)) {
    throw new Error(`Unexpected coverage outputs: ${outputEntries.join(', ')}`);
  }

  process.stdout.write(
    `Canonical production coverage keys: ${String(actualFiles.length)}/${String(expectedFiles.length)} unique\n`
  );
  process.stdout.write(`Canonical shared suite keys: ${JSON.stringify(suiteKeys)}\n`);
  process.stdout.write(`Canonical coverage totals: ${JSON.stringify(totals)}\n`);
}

function runGit(args) {
  const result = spawnSync('git', args, { cwd: workspaceRoot, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args[0]} failed with exit code ${String(result.status)}`);
  return result.stdout;
}

/** 把 `--name-status -z` 的「状态\0路径\0」流拍平成 `状态 路径` 行。 */
function parseNameStatus(output) {
  const fields = output.split('\0').filter(Boolean);
  const entries = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    // 已 `git add` 的新文件在这里是 A，与「未跟踪新文件」是同一件事，统一记成 +。
    const status = fields[index] === 'A' ? '+' : fields[index];
    entries.push(`${status} ${fields[index + 1]}`);
  }
  return entries;
}

/**
 * 门禁跑完必须还原 Git 工作区（SQLC-039）。
 *
 * 比对前后快照而不是断言「必须为空」：本地开发者带着未提交改动跑门禁是常态，
 * 要抓的是**门禁自己**产生/删除的文件。跟踪中的生成物（如曾被提交的 coverage blob）
 * 会被 runner 的 rmSync 标成 deleted，正是这条断言要挡的回归。
 *
 * @remarks
 * 快照刻意只描述「工作区相对 HEAD 长什么样」，不含暂存状态。
 * 早先用的 `git status --porcelain` 首列会随任何一次 `git add` 变化
 * （` M` → `M `、`??` → `A `），本地并行跑的工具一暂存就让门禁误报污染，
 * 而文件集其实分毫未动。改用 `git diff HEAD`（内容差异）+
 * `git ls-files --others`（未跟踪）后，add / unstage 不影响快照，
 * 门禁自己新增或删除文件则必然改变它。`--no-renames` 是必需的：
 * 暂存后的重命名是一条 R，未暂存时却是 D + 未跟踪，不归一就对不上。
 */
function gitStatusSnapshot() {
  const changed = parseNameStatus(runGit(['diff', 'HEAD', '--name-status', '--no-renames', '-z']));
  const untracked = runGit(['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter(Boolean)
    .map(file => `+ ${file}`);
  return [...changed, ...untracked].sort().join('\n');
}

function verifyGitUnchanged(before) {
  const after = gitStatusSnapshot();
  if (after === before) return;
  throw new Error(
    `Coverage acceptance mutated the Git working tree.\n--- before ---\n${before}\n--- after ---\n${after}`
  );
}

const gitStatusBefore = gitStatusSnapshot();

rmSync(acceptanceRoot, { force: true, recursive: true });
rmSync(outputRoot, { force: true, recursive: true });

try {
  runVitest(['run', '--config', 'vitest.coverage-acceptance.unit.config.mts']);
  runVitest(['run', '--config', 'vitest.coverage-acceptance.pglite.config.mts']);
  runVitest(['--config', 'vitest.coverage-acceptance.merge.config.mts', '--mergeReports', blobsRoot]);
  verifyCanonicalCoverage();
  verifyGitUnchanged(gitStatusBefore);
} catch (error) {
  rmSync(outputRoot, { force: true, recursive: true });
  throw error;
} finally {
  rmSync(acceptanceRoot, { force: true, recursive: true });
}
