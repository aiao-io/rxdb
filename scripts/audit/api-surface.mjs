/**
 * scripts/audit/api-surface.mjs
 *
 * API 表面基线 / diff 工具 —— 在 PR 改动公共 API 时拦截破坏性变化。
 *
 * 工作方式：
 *   - 对每个公开包（非 private、有 src/index.ts）枚举 `exports` 声明的**全部**入口
 *     （主入口 + 子路径），用 TypeScript 编译器解析各自的源文件，展开 export * / re-export，
 *     得到真实可见的 `{ name, kind: 'type' | 'value' | 'both' }[]`；
 *   - 对比 requirements/api-baseline/<pkg>.json：
 *       removed / kind changed  → 破坏性，PR 必须附迁移说明；
 *       added only              → 基线漂移，跑 --update 同步即可；
 *       完全一致                → 通过。
 *
 * 解析用 tsconfig.base.json 的 paths，不用 node_modules —— 本地与 CI 结果一致。
 *
 * 用法：
 *   pnpm audit:api-surface             # --check（默认，CI 门禁）
 *   pnpm audit:api-surface:update      # 重新生成基线
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

import { auditAssetWhitelistScope, resolveScanEntries } from './subpath-inventory.mjs';

/**
 * API 表面基线 / diff。
 *
 * 对每个公开包的每个公开入口，从其**源文件**提取导出符号表面（名称 + 种类），
 * 生成排序后的黄金快照 `requirements/api-baseline/<pkg>.json`，格式为
 * `{ entries: { ".": [...], "./testing": [...] } }`。
 *
 * 用法：
 *   node scripts/audit/api-surface.mjs            # 默认 --check
 *   node scripts/audit/api-surface.mjs --check    # 对比基线，出现未声明变化时失败退出
 *   node scripts/audit/api-surface.mjs --update    # 重新生成基线（预期变更时使用）
 *
 * 设计取舍：
 * - 基于源文件（路径稳定），而非 dist 产物 —— 普通包与 ng-packagr 包的构建输出目录不同，
 *   源入口则始终一致，且无需先构建即可运行。
 * - 入口 → 源文件的唯一真相源是 `package.json` › `exports` › `@aiao/source`（主入口除外，
 *   固定取 `src/index.ts`）。声明与入口同处一地，不会像「另一份 paths 清单」那样各自漂移；
 *   没有该条件的子路径入口一律硬失败，不从 `import`/`types` 反推，也不降级为「零导出」。
 * - 跨包引用用 `tsconfig.base.json` 的 paths 解析（而非 node_modules），保证本地与 CI
 *   提取结果一致；无法解析的导出符号直接报错，不降级猜测种类。
 * - 无导出表面的资产入口（wasm / CJS）按 `ASSET_SUBPATHS` 白名单显式跳过，
 *   其内容由 `scripts/audit/wa-sqlite-integrity.mjs` 的 SHA-256 固定守护。
 * - 通过 TS 编译器解析 `export *` / re-export，得到入口真实可见的导出集合。
 * - 只记录名称与种类（type/value/both），不做完整签名快照 —— 目标是捕获「导出被
 *   增删或改变种类」这类信号，触发人工审查，而非替代类型契约测试。
 * - 判定分级：入口移除 / 符号 removed / 种类 changed = 破坏性（需迁移说明）；
 *   仅新增入口或新增符号 = 基线漂移（更新基线即可）。两者都拦 CI，但对 PR 作者的要求不同。
 */

const root = process.cwd();
const packagesDir = join(root, 'packages');
const baselineDir = join(root, 'requirements', 'api-baseline');

// 不纳入 API 基线的包：测试夹具 / 非产品公开 API。
const EXCLUDED = new Set(['rxdb-test']);

/**
 * **无导出表面**的资产入口白名单 —— 这些 `exports` 子路径指向二进制 / CJS 文件，
 * 没有 TS 源可解析，因此显式跳过表面扫描，改由
 * `scripts/audit/wa-sqlite-integrity.mjs` 的 SHA-256 固定守护其内容。
 *
 * 白名单是**收窄**的：其余子路径入口一律必须声明 `@aiao/source` 并进基线，
 * 新增一个既不在白名单、又没有源入口声明的子路径 → 门禁红（见 `resolveScanEntries()`）。
 * 反向也守：白名单登记了包里已不存在的入口，或登记的包已退出扫描范围，同样门禁红。
 *
 * `@aiao/rxdb-test/*`（5 个子路径）不在此列——整包已由 EXCLUDED 排除，非产品 API。
 * @type {Map<string, string[]>}
 */
const ASSET_SUBPATHS = new Map([['rxdb-adapter-miniprogram', ['./assets/wa-sqlite.cjs', './assets/wa-sqlite.wasm']]]);

const mode = process.argv.includes('--update') ? 'update' : 'check';

/**
 * 列出需要纳入 API 表面扫描的公开包。
 * 规则：
 *   - 必须位于 packages/ 下、是目录；
 *   - 必须有 src/index.ts（主入口解析目标固定）；
 *   - 必须有 package.json，且 private !== true；
 *   - 默认排除 rxdb-test（测试夹具，不属于产品 API）。
 * @returns {string[]} 包名（目录名）排序后
 */
function listPublicPackages() {
  return readdirSync(packagesDir)
    .filter(name => {
      const dir = join(packagesDir, name);
      if (!statSync(dir).isDirectory()) return false;
      if (EXCLUDED.has(name)) return false;
      if (!existsSync(join(dir, 'src', 'index.ts'))) return false;
      const pkgJsonPath = join(dir, 'package.json');
      if (!existsSync(pkgJsonPath)) return false;
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
      // 跳过显式 private 包。
      return pkgJson.private !== true;
    })
    .sort();
}

/**
 * 用 TS 编译器解析入口文件真实可见的导出，返回 `{ name, kind }[]`。
 * kind: 'type' | 'value' | 'both'
 */
const baseConfig = ts.readConfigFile(join(root, 'tsconfig.base.json'), ts.sys.readFile);
if (baseConfig.error) {
  throw new Error(
    `无法读取 tsconfig.base.json：${ts.flattenDiagnosticMessageText(baseConfig.error.messageText, '\n')}`
  );
}
const workspacePaths = baseConfig.config.compilerOptions?.paths ?? {};

/** 收集包 src 下的 `.d.ts`（如 vue-shims），作为 program 根文件以加载 ambient module 声明。 */
function listAmbientDeclarations(srcDir) {
  return readdirSync(srcDir, { recursive: true })
    .filter(name => typeof name === 'string' && name.endsWith('.d.ts'))
    .map(name => join(srcDir, name));
}

/**
 * 用 TypeScript 编译器解析入口文件真实可见的导出，返回 `{ name, kind }[]`。
 * kind: 'type' | 'value' | 'both'
 * @param {string} entryFile 入口路径（如 packages/rxdb-core/src/index.ts）
 * @param {string} srcDir 同包 src/ 目录，用于加载 .d.ts ambient 声明
 */
function extractExports(entryFile, srcDir) {
  const program = ts.createProgram([entryFile, ...listAmbientDeclarations(srcDir)], {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ESNext,
    customConditions: ['@aiao/source'],
    baseUrl: root,
    paths: workspacePaths,
    jsx: ts.JsxEmit.Preserve,
    noEmit: true,
    skipLibCheck: true,
    allowJs: false
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entryFile);
  if (!source) throw new Error(`无法加载入口文件：${entryFile}`);

  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) return [];

  const flags = ts.SymbolFlags;
  const results = [];
  for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
    let resolved = symbol;
    if (symbol.flags & flags.Alias) resolved = checker.getAliasedSymbol(symbol);
    // 别名解析失败时 TS 返回无声明的 unknown symbol（带 Property flag），
    // 若不拦截会被误记为 value —— 这里必须硬失败。
    if (!resolved.declarations?.length) {
      throw new Error(`导出符号 ${symbol.getName()} 无法解析（re-export 目标缺失或路径未配置）`);
    }
    const isType = Boolean(resolved.flags & (flags.Type | flags.Interface | flags.TypeAlias | flags.TypeParameter));
    const isValue = Boolean(resolved.flags & flags.Value);
    const kind =
      isType && isValue ? 'both'
      : isType ? 'type'
      : 'value';
    results.push({ name: symbol.getName(), kind });
  }
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

function baselinePath(pkg) {
  return join(baselineDir, `${pkg}.json`);
}

/**
 * 读取基线文件，返回 `{ [subpath]: exports[] }`。
 *
 * 旧的单入口格式（`{ exports: [] }`）不做兼容读取——留一条兼容分支就等于允许一半的包
 * 停在旧格式；这里直接报错，让作者跑一次 `--update` 全量重写。
 * @returns {Record<string, Array<{ name: string, kind: string }>> | null} 无基线文件时为 null
 */
function loadBaseline(pkg) {
  const p = baselinePath(pkg);
  if (!existsSync(p)) return null;
  const parsed = JSON.parse(readFileSync(p, 'utf8'));
  if (typeof parsed.entries !== 'object' || parsed.entries === null) {
    throw new Error('基线为旧的单入口格式，请运行 --update 全量重写为 { entries: { ... } }');
  }
  return parsed.entries;
}

/** 按子路径排序序列化，让 diff 只反映真实变化而非枚举顺序。 */
function serialize(entriesBySubpath) {
  const sorted = Object.fromEntries(Object.entries(entriesBySubpath).sort(([a], [b]) => a.localeCompare(b)));
  return `${JSON.stringify({ entries: sorted }, null, 2)}\n`;
}

/**
 * 计算新旧两个导出列表的差集：
 *   - removed：上一版有、这一版没；
 *   - added：上一版没、这一版有；
 *   - changed：name 都在但 kind 不同（type/value/both 任一变化都算）。
 * @param {Array<{ name: string, kind: 'type' | 'value' | 'both' }>} previous
 * @param {Array<{ name: string, kind: 'type' | 'value' | 'both' }>} current
 */
function diff(previous, current) {
  const prevMap = new Map(previous.map(e => [e.name, e.kind]));
  const currMap = new Map(current.map(e => [e.name, e.kind]));
  const removed = previous.filter(e => !currMap.has(e.name)).map(e => e.name);
  const added = current.filter(e => !prevMap.has(e.name)).map(e => e.name);
  const changed = current
    .filter(e => prevMap.has(e.name) && prevMap.get(e.name) !== e.kind)
    .map(e => `${e.name} (${prevMap.get(e.name)} → ${e.kind})`);
  return { removed, added, changed };
}

/**
 * 在入口维度与符号维度上同时求差。
 *
 * 入口整体消失是破坏性的最强信号（使用者的 import 直接解析失败），必须与
 * 「入口还在、少了个符号」区分输出；入口新增则只是漂移。
 * @param {Record<string, Array<{ name: string, kind: string }>>} previous
 * @param {Record<string, Array<{ name: string, kind: string }>>} current
 */
function diffEntries(previous, current) {
  const removedEntries = Object.keys(previous)
    .filter(subpath => !(subpath in current))
    .sort();
  const addedEntries = Object.keys(current)
    .filter(subpath => !(subpath in previous))
    .sort();
  const perEntry = Object.keys(current)
    .filter(subpath => subpath in previous)
    .sort()
    .map(subpath => ({ subpath, ...diff(previous[subpath], current[subpath]) }))
    .filter(d => d.removed.length > 0 || d.added.length > 0 || d.changed.length > 0);
  return { removedEntries, addedEntries, perEntry };
}

const packages = listPublicPackages();
if (mode === 'update' && !existsSync(baselineDir)) mkdirSync(baselineDir, { recursive: true });

// —— 第一遍：枚举入口并解析源文件位置 ——
// 入口清单错了，基线内容就是错的，因此两种模式下都先拦住：`--update` 若带着「解析不了的
// 入口」继续写基线，等于把一个入口静默从快照里删掉。
const scanPlan = new Map();
const planProblems = [];
for (const pkg of packages) {
  const { entries, skippedAssets, problems } = resolveScanEntries(
    join(packagesDir, pkg),
    ASSET_SUBPATHS.get(pkg) ?? []
  );
  scanPlan.set(pkg, { entries, skippedAssets });
  for (const problem of problems) planProblems.push(`${pkg} ${problem}`);
}
for (const problem of auditAssetWhitelistScope(packages, ASSET_SUBPATHS)) planProblems.push(problem);

if (planProblems.length > 0) {
  console.log('❌ `exports` 入口与源入口声明不一致：');
  for (const problem of planProblems) console.log(`   ${problem}`);
  console.log('   → 有导出表面的子路径请在 package.json 的 exports 里补 `@aiao/source` 指向 .ts 源文件；');
  console.log('     无导出表面的资产入口请登记进 api-surface.mjs 的 ASSET_SUBPATHS。');
  process.exit(1);
}

let breaking = 0; // 入口移除 / 符号 removed / 种类 changed —— 需迁移说明
let drift = 0; // 仅新增入口或新增符号 —— 更新基线即可
let errors = 0; // 解析失败 / 缺基线
let updated = 0;
let scannedEntries = 0;
let skippedAssetEntries = 0;

for (const pkg of packages) {
  const { entries, skippedAssets } = scanPlan.get(pkg);
  const srcDir = join(packagesDir, pkg, 'src');
  skippedAssetEntries += skippedAssets.length;
  for (const subpath of skippedAssets) {
    console.log(
      `⏭️  ${pkg}${subpath.slice(1)}: 资产入口，无导出表面（内容由 wa-sqlite-integrity.mjs 的 SHA-256 守护）`
    );
  }

  const current = {};
  let failed = false;
  for (const { subpath, sourceFile } of entries) {
    try {
      current[subpath] = extractExports(sourceFile, srcDir);
    } catch (error) {
      console.log(`❌ ${pkg} ${subpath}: 解析失败（${relative(root, sourceFile)}）— ${error.message}`);
      failed = true;
      break;
    }
  }
  if (failed) {
    errors++;
    continue;
  }
  scannedEntries += entries.length;
  const symbolCount = Object.values(current).reduce((sum, list) => sum + list.length, 0);

  if (mode === 'update') {
    writeFileSync(baselinePath(pkg), serialize(current));
    console.log(`📝 ${pkg}: 基线已更新（${entries.length} 个入口 / ${symbolCount} 个导出）`);
    updated++;
    continue;
  }

  let baseline;
  try {
    baseline = loadBaseline(pkg);
  } catch (error) {
    console.log(`❌ ${pkg}: ${error.message}`);
    errors++;
    continue;
  }
  if (!baseline) {
    console.log(`⚠️  ${pkg}: 无基线文件，请先运行 --update`);
    errors++;
    continue;
  }

  const { removedEntries, addedEntries, perEntry } = diffEntries(baseline, current);
  const hasBreaking = removedEntries.length > 0 || perEntry.some(d => d.removed.length > 0 || d.changed.length > 0);
  const hasDrift = addedEntries.length > 0 || perEntry.some(d => d.added.length > 0);

  if (!hasBreaking && !hasDrift) {
    console.log(`✅ ${pkg}: 表面无变化（${entries.length} 个入口 / ${symbolCount} 个导出）`);
    continue;
  }

  if (hasBreaking) {
    breaking++;
    console.log(`❌ ${pkg}: 破坏性 API 变化`);
  } else {
    drift++;
    console.log(`🟡 ${pkg}: 仅新增入口 / 导出（基线漂移）`);
  }
  if (removedEntries.length > 0) console.log(`   入口移除（破坏性）：${removedEntries.join(', ')}`);
  if (addedEntries.length > 0) console.log(`   入口新增：${addedEntries.join(', ')}`);
  for (const { subpath, removed, added, changed } of perEntry) {
    if (removed.length > 0) console.log(`   ${subpath} 移除（破坏性）：${removed.join(', ')}`);
    if (changed.length > 0) console.log(`   ${subpath} 种类变化（破坏性）：${changed.join(', ')}`);
    if (added.length > 0) console.log(`   ${subpath} 新增：${added.join(', ')}`);
  }
}

if (mode === 'update') {
  if (errors > 0) {
    console.log(`\n❌ ${errors} 个包解析失败，基线未完整重写。`);
    process.exit(1);
  }
  console.log(`\n✅ 已更新 ${updated} 个包的 API 基线（共 ${scannedEntries} 个入口）。`);
  process.exit(0);
}

if (breaking + drift + errors > 0) {
  console.log('');
  if (errors > 0) console.log(`📋 ${errors} 处解析失败 / 缺少基线文件 / 基线格式过期，请先排查 / 运行 --update。`);
  if (breaking > 0) {
    console.log(
      `📋 ${breaking} 个包存在破坏性变化（入口或符号移除 / 种类变化）：更新基线之外，` +
        `还需在 PR 中提供迁移说明（breaking note）。`
    );
  }
  if (drift > 0) {
    console.log(
      `📋 ${drift} 个包仅新增入口 / 导出：运行 \`node scripts/audit/api-surface.mjs --update\` 同步基线即可。`
    );
  }
  process.exit(1);
}

console.log(
  `\n✅ 全部 ${packages.length} 个公开包、${scannedEntries} 个公开入口的 API 表面与基线一致` +
    `（另跳过 ${skippedAssetEntries} 个无导出表面的资产入口）。`
);
