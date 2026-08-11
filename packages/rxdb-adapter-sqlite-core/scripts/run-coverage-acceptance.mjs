import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
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
const acceptanceRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'aiao-sqlite-core-acceptance-')));
const blobsRoot = path.join(acceptanceRoot, 'blobs');
const outputRoot = path.join(workspaceRoot, 'coverage/packages/rxdb-adapter-sqlite-core');
const vitestRoot = path.dirname(require.resolve('vitest/package.json'));
const vitestBin = path.join(vitestRoot, 'vitest.mjs');
const configFile = 'vitest.coverage-acceptance.config.mts';
const suiteNames = ['core', 'wa-sqlite', 'sqlite', 'sqlite-wasm', 'sqliteai'];
// 需要真实 chromium 的 suite，必须与 vitest.coverage-acceptance.config.mts 的 browserSuites 同步。
// 对不齐的后果是可见的：漏了的 suite 会跑不出 blob，verifyBlobReports 立刻报缺。
const browserSuiteNames = ['wa-sqlite', 'sqlite', 'sqlite-wasm', 'sqliteai'];
const excludedSourceFiles = new Set(['testing.ts', 'fts5/types.ts', 'oo1-types.ts']);
const threshold = 80;
const metrics = ['statements', 'branches', 'functions', 'lines'];
/** 失败分类：测试环境缺能力，不代表产品有问题（SQLC-038）。 */
const ENVIRONMENT_CAPABILITY = 'environment-capability';
/** 失败分类：产品或门禁自身的问题，必须修。 */
const PRODUCT_FAILURE = 'product-failure';

/**
 * 造一个带分类标签的门禁错误。
 *
 * @param kind - {@link ENVIRONMENT_CAPABILITY} 或 {@link PRODUCT_FAILURE}
 * @param message - 面向人的失败说明
 */
function acceptanceError(kind, message) {
  const error = new Error(message);
  error.acceptanceKind = kind;
  return error;
}

/**
 * 起跑前先探测浏览器能力（SQLC-038）。
 *
 * 四个适配器 suite 只能在 chromium 里跑。把「playwright 没装浏览器」这种环境问题
 * 前置成一条独立分类的错误，而不是让它伪装成一堆 `ReferenceError` 式的用例失败 ——
 * 后者会让人误以为是产品回归，正是这条门禁此前形同虚设的原因。
 */
function verifyBrowserCapability() {
  if (browserSuiteNames.length === 0) return;

  let executablePath;
  try {
    executablePath = require('playwright').chromium.executablePath();
  } catch (cause) {
    throw acceptanceError(
      ENVIRONMENT_CAPABILITY,
      `Cannot resolve playwright chromium: ${cause.message}\n` +
        `Suites requiring a browser: ${browserSuiteNames.join(', ')}`
    );
  }

  if (!existsSync(executablePath)) {
    throw acceptanceError(
      ENVIRONMENT_CAPABILITY,
      `Playwright chromium is not installed at ${executablePath}\n` +
        `Run "pnpm exec playwright install chromium" first.\n` +
        `Suites requiring a browser: ${browserSuiteNames.join(', ')}`
    );
  }
}

/**
 * 门禁的唯一原子汇总（SQLC-038）。
 *
 * 成功与失败都只在这里打印一次，且格式一致：外部只需 grep 这一行就能判定门禁结论，
 * 不必去 5 份交错的 vitest 输出里拼。
 */
function writeSummary(verdict, kind, suiteOutcomes) {
  process.stdout.write(
    `Coverage acceptance summary: ${JSON.stringify({
      verdict,
      kind,
      suites: suiteOutcomes
    })}\n`
  );
}

function runSuite(suiteName) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [vitestBin, 'run', '--config', configFile], {
      cwd: packageRoot,
      env: {
        ...process.env,
        AIAO_ACCEPTANCE_ROOT: acceptanceRoot,
        SQLITE_CORE_COVERAGE_SUITE: suiteName
      },
      stdio: 'inherit'
    });

    child.on('error', error => resolve({ suiteName, error }));
    child.on('exit', (code, signal) => resolve({ suiteName, code, signal }));
  });
}

function runMerge() {
  const env = { ...process.env, AIAO_ACCEPTANCE_ROOT: acceptanceRoot };
  delete env.SQLITE_CORE_COVERAGE_SUITE;
  const result = spawnSync(process.execPath, [vitestBin, '--config', configFile, '--mergeReports', blobsRoot], {
    cwd: packageRoot,
    env,
    stdio: 'inherit'
  });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Vitest report merge failed with exit code ${String(result.status)}`);
}

function collectProductionFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') return [];
      return collectProductionFiles(absolutePath);
    }
    if (!entry.name.endsWith('.ts') || /\.(?:spec|test)\.ts$/.test(entry.name)) return [];

    const relativePath = path.relative(path.join(packageRoot, 'src'), absolutePath);
    if (excludedSourceFiles.has(relativePath)) return [];
    return [realpathSync(absolutePath)];
  });
}

function toCanonicalPath(coverageKey) {
  const filePath = coverageKey.startsWith('file:') ? fileURLToPath(coverageKey) : coverageKey;
  return realpathSync(path.isAbsolute(filePath) ? filePath : path.resolve(packageRoot, filePath));
}

function verifyBlobReports() {
  const missingBlobs = suiteNames
    .map(suiteName => path.join(blobsRoot, `${suiteName}.json`))
    .filter(blobPath => !existsSync(blobPath));
  if (missingBlobs.length > 0) throw new Error(`Missing Vitest blob reports:\n${missingBlobs.join('\n')}`);
}

function verifyCanonicalCoverage() {
  const finalPath = path.join(outputRoot, 'coverage-final.json');
  const summaryPath = path.join(outputRoot, 'coverage-summary.json');
  const coverage = JSON.parse(readFileSync(finalPath, 'utf8'));
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const canonicalGroups = new Map();

  for (const coverageKey of Object.keys(coverage)) {
    const canonicalPath = toCanonicalPath(coverageKey);
    const keys = canonicalGroups.get(canonicalPath) ?? [];
    keys.push(coverageKey);
    canonicalGroups.set(canonicalPath, keys);
  }

  const duplicateGroups = [...canonicalGroups].filter(([, keys]) => keys.length !== 1);
  if (duplicateGroups.length > 0) {
    const details = duplicateGroups.map(([canonical, keys]) => `${canonical}: ${keys.join(', ')}`).join('\n');
    throw new Error(`Duplicate source-map coverage keys detected:\n${details}`);
  }

  const expectedFiles = collectProductionFiles(path.join(packageRoot, 'src')).sort();
  const actualFiles = [...canonicalGroups.keys()].sort();
  const expectedSet = new Set(expectedFiles);
  const missingFiles = expectedFiles.filter(file => !canonicalGroups.has(file));
  const unexpectedFiles = actualFiles.filter(file => !expectedSet.has(file));

  if (missingFiles.length > 0) throw new Error(`Missing production coverage keys:\n${missingFiles.join('\n')}`);
  if (unexpectedFiles.length > 0) throw new Error(`Unexpected coverage keys:\n${unexpectedFiles.join('\n')}`);

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
let suiteOutcomes = Object.fromEntries(suiteNames.map(suiteName => [suiteName, 'not-run']));

rmSync(acceptanceRoot, { force: true, recursive: true });
rmSync(outputRoot, { force: true, recursive: true });

try {
  // 能力探测放在跑 suite 之前：浏览器没装就没必要先烧十几分钟再失败。
  verifyBrowserCapability();

  const suiteResults = await Promise.all(suiteNames.map(runSuite));
  suiteOutcomes = Object.fromEntries(
    suiteResults.map(result => [
      result.suiteName,
      result.error ? `error: ${result.error.message}`
      : result.code === 0 ? 'passed'
      : `failed: exit ${String(result.code)}, signal ${String(result.signal)}`
    ])
  );

  const failedSuites = suiteResults.filter(result => result.error || result.code !== 0);
  if (failedSuites.length > 0) {
    const details = failedSuites.map(result => `${result.suiteName}: ${suiteOutcomes[result.suiteName]}`).join('\n');
    // 能力探测已经过了，此刻失败一律算产品失败（含门禁自身配置错误）。
    throw acceptanceError(PRODUCT_FAILURE, `SQLite core coverage suites failed:\n${details}`);
  }

  verifyBlobReports();
  runMerge();
  verifyCanonicalCoverage();
  verifyGitUnchanged(gitStatusBefore);
  writeSummary('passed', null, suiteOutcomes);
} catch (error) {
  rmSync(outputRoot, { force: true, recursive: true });
  writeSummary('failed', error.acceptanceKind ?? PRODUCT_FAILURE, suiteOutcomes);
  throw error;
} finally {
  rmSync(acceptanceRoot, { force: true, recursive: true });
}
