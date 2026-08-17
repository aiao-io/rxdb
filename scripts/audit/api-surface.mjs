/**
 * scripts/audit/api-surface.mjs
 *
 * API 表面基线 / diff 工具 —— 在 PR 改动公共 API 时拦截破坏性变化。
 *
 * 工作方式：
 *   - 对每个公开包（非 private、有 src/index.ts）用 TypeScript 编译器解析入口，
 *     展开 export * / re-export，得到真实可见的 `{ name, kind: 'type' | 'value' | 'both' }[]`；
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
import { join } from 'node:path';
import ts from 'typescript';

import { auditSubpathInventory } from './subpath-inventory.mjs';

/**
 * API 表面基线 / diff。
 *
 * 对每个公开包，从其源入口 `src/index.ts` 提取导出符号表面（名称 + 种类），
 * 生成排序后的黄金快照 `requirements/api-baseline/<pkg>.json`。
 *
 * 用法：
 *   node scripts/audit/api-surface.mjs            # 默认 --check
 *   node scripts/audit/api-surface.mjs --check    # 对比基线，出现未声明变化时失败退出
 *   node scripts/audit/api-surface.mjs --update    # 重新生成基线（预期变更时使用）
 *
 * 设计取舍：
 * - 基于源 `src/index.ts`（路径稳定），而非 dist 产物 —— 普通包与 ng-packagr 包的
 *   构建输出目录不同，源入口则始终一致，且无需先构建即可运行。
 * - 跨包引用用 `tsconfig.base.json` 的 paths 解析（而非 node_modules），保证本地与 CI
 *   提取结果一致；无法解析的导出符号直接报错，不降级猜测种类。
 * - 【v1 边界】只扫主入口 `src/index.ts`，不覆盖 package.json `exports` 子路径入口
 *   （如 `@aiao/x/sub`）。子路径的**导出表面**变化不会被本门禁捕获，需人工审查；
 *   但子路径的**清单**受 `KNOWN_UNCOVERED_SUBPATHS` 守护（见其注释），新增或删除
 *   子路径而不同步清单会让本门禁失败。
 * - 通过 TS 编译器解析 `export *` / re-export，得到入口真实可见的导出集合。
 * - 只记录名称与种类（type/value/both），不做完整签名快照 —— 目标是捕获「导出被
 *   增删或改变种类」这类信号，触发人工审查，而非替代类型契约测试。
 * - 判定分级：removed / 种类 changed = 破坏性（需迁移说明）；仅 added = 基线漂移
 *   （更新基线即可）。两者都拦 CI，但对 PR 作者的要求不同。
 */

const root = process.cwd();
const packagesDir = join(root, 'packages');
const baselineDir = join(root, 'requirements', 'api-baseline');

// 不纳入 API 基线的包：测试夹具 / 非产品公开 API。
const EXCLUDED = new Set(['rxdb-test']);

/**
 * `exports` 子路径入口清单 —— 这些入口**属于公开 API**（见
 * requirements/versioning-policy.md 第 2 节），但**导出表面不受本基线保护**：
 * 本脚本的 v1 边界只解析主入口 `src/index.ts`。改动它们的导出必须在 PR 描述里人工声明破坏性。
 *
 * 本表是那份「已知不覆盖」清单的**真相源**（versioning-policy.md 与 website/docs/versioning.md
 * 都指回这里），并由 `auditSubpathInventory()` 逐包核对：新增或删除子路径而不同步本表 → 门禁红。
 * 这样清单不会随包演进静默过期，作者也会在动到无保护的公开 API 时被拦一次。
 *
 * 10 个包共 16 个入口。其中 `rxdb-adapter-miniprogram` 的两个 `./assets/*` 是二进制/CJS 资产，
 * 没有导出表面可扫，改由 `scripts/audit/wa-sqlite-integrity.mjs` 的 SHA-256 固定守护。
 * `@aiao/rxdb-test/*`（5 个子路径）不在此列——整包已由 EXCLUDED 排除，非产品 API。
 *
 * 扩展扫描器以覆盖子路径导出表面由 US-601 认领（Backlog），见
 * requirements/stories/tooling/US-601-subpath-api-surface-baseline.md；
 * 交付后本表的语义应收窄为「无导出表面的资产入口白名单」，常量名一并改掉。
 * @type {Map<string, string[]>}
 */
const KNOWN_UNCOVERED_SUBPATHS = new Map([
  // ./host = node:sqlite 引擎 + SQL/文件宿主。特权侧独立成入口，免得被打进 renderer bundle。
  // Tauri 侧没有对应项：它的特权侧是 Rust，随应用二进制走，不经 npm 分发。
  ['rxdb-adapter-electron', ['./host']],
  ['rxdb-adapter-encrypted', ['./testing']],
  // ./runtime = prepareMiniProgramRuntime 等 5 个值 + 6 个类型，共 11 个符号。
  ['rxdb-adapter-miniprogram', ['./assets/wa-sqlite.cjs', './assets/wa-sqlite.wasm', './runtime']],
  ['rxdb-adapter-pglite', ['./testing']],
  // ./desktop-host = 桌面 host 契约（线协议 + renderer client + 存储联合 + 错误类型），
  // Electron 与 Tauri 两个运行时包共用。不进主入口：另外五个下游适配器一行都用不上，
  // 却要跟着进 bundle。
  ['rxdb-adapter-sqlite-core', ['./desktop-host', './testing']],
  ['rxdb-adapter-wa-sqlite', ['./client']],
  ['rxdb-client-generator', ['./cli', './vite']],
  // ./testing = conformance driver 接缝 + wire hygiene 套件 + fake clock/driver，
  // 供 US-904c/904d/905 的 Chrome / Electron / Tauri 薄 driver 复跑同一份 v2 协议断言；
  // 依赖 vitest，只在测试环境使用。
  ['rxdb-devtools', ['./testing']],
  ['rxdb-plugin-graph', ['./generator', './sqlite']],
  // ./desktop = createDesktopStorageFilesystem + DesktopStorageFilesystemOptions。
  // 该入口依赖桌面 host 传输层，不能进浏览器 bundle，因此不从主入口导出。
  // ./testing = storageBackendParitySuite + isTemporaryStorageName + ParityBackend，
  // 供包外后端（Tauri 的 Rust 宿主）证明行为一致；依赖 vitest，只在测试环境使用。
  ['rxdb-plugin-storage', ['./desktop', './testing']]
]);

const mode = process.argv.includes('--update') ? 'update' : 'check';

/**
 * 列出需要纳入 API 表面扫描的公开包。
 * 规则：
 *   - 必须位于 packages/ 下、是目录；
 *   - 必须有 src/index.ts（解析目标固定）；
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

function loadBaseline(pkg) {
  const p = baselinePath(pkg);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function serialize(exportsList) {
  return `${JSON.stringify({ exports: exportsList }, null, 2)}\n`;
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

const packages = listPublicPackages();
if (mode === 'update' && !existsSync(baselineDir)) mkdirSync(baselineDir, { recursive: true });

let breaking = 0; // removed / 种类 changed —— 需迁移说明
let drift = 0; // 仅 added —— 更新基线即可
let errors = 0; // 解析失败 / 缺基线 / 子路径清单过期
let updated = 0;

// 子路径清单核对：守清单不过期，不是守子路径的导出表面（后者是 v1 边界外）。
const subpathProblems = auditSubpathInventory(packagesDir, packages, KNOWN_UNCOVERED_SUBPATHS);
if (subpathProblems.length > 0) {
  console.log('❌ `exports` 子路径入口清单与仓库现状不一致：');
  for (const problem of subpathProblems) console.log(`   ${problem}`);
  console.log('   → 同步 api-surface.mjs 的 KNOWN_UNCOVERED_SUBPATHS。');
  console.log('     这些入口的导出表面不受本基线保护，改动其导出必须在 PR 描述里人工声明破坏性。');
  // `--update` 只重建基线，不改这份手工清单，所以那里只提示不阻断。
  if (mode === 'check') errors += subpathProblems.length;
}

for (const pkg of packages) {
  const entryFile = join(packagesDir, pkg, 'src', 'index.ts');
  let current;
  try {
    current = extractExports(entryFile, join(packagesDir, pkg, 'src'));
  } catch (error) {
    console.log(`❌ ${pkg}: 解析失败 — ${error.message}`);
    errors++;
    continue;
  }

  if (mode === 'update') {
    writeFileSync(baselinePath(pkg), serialize(current));
    console.log(`📝 ${pkg}: 基线已更新（${current.length} 个导出）`);
    updated++;
    continue;
  }

  const baseline = loadBaseline(pkg);
  if (!baseline) {
    console.log(`⚠️  ${pkg}: 无基线文件，请先运行 --update`);
    errors++;
    continue;
  }

  const { removed, added, changed } = diff(baseline.exports, current);
  if (removed.length === 0 && added.length === 0 && changed.length === 0) {
    console.log(`✅ ${pkg}: 表面无变化（${current.length} 个导出）`);
    continue;
  }

  if (removed.length > 0 || changed.length > 0) {
    breaking++;
    console.log(`❌ ${pkg}: 破坏性 API 变化`);
  } else {
    drift++;
    console.log(`🟡 ${pkg}: 仅新增导出（基线漂移）`);
  }
  if (removed.length > 0) console.log(`   移除（破坏性）：${removed.join(', ')}`);
  if (changed.length > 0) console.log(`   种类变化（破坏性）：${changed.join(', ')}`);
  if (added.length > 0) console.log(`   新增：${added.join(', ')}`);
}

if (mode === 'update') {
  console.log(`\n✅ 已更新 ${updated} 个包的 API 基线。`);
  process.exit(0);
}

if (breaking + drift + errors > 0) {
  console.log('');
  if (errors > 0) console.log(`📋 ${errors} 处解析失败 / 缺少基线文件 / 子路径清单过期，请先排查 / 运行 --update。`);
  if (breaking > 0) {
    console.log(
      `📋 ${breaking} 个包存在破坏性变化（移除 / 种类变化）：更新基线之外，` +
        `还需在 PR 中提供迁移说明（breaking note）。`
    );
  }
  if (drift > 0) {
    console.log(`📋 ${drift} 个包仅新增导出：运行 \`node scripts/audit/api-surface.mjs --update\` 同步基线即可。`);
  }
  process.exit(1);
}

console.log(
  `\n✅ 全部 ${packages.length} 个公开包 API 表面与基线一致` +
    `（另核对 ${KNOWN_UNCOVERED_SUBPATHS.size} 个包的子路径清单）。`
);
