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
import { pathToFileURL } from 'node:url';
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
 * - 无导出表面的资产入口（wasm / CJS）按 `ASSET_SUBPATHS` 白名单显式跳过 —— 这类入口
 *   的内容由供应链审计脚本另行守护，不在 API 表面的职责范围内。
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
 * 没有 TS 源可解析，因此显式跳过表面扫描，其内容改由供应链审计脚本守护。
 *
 * 白名单是**收窄**的：其余子路径入口一律必须声明 `@aiao/source` 并进基线，
 * 新增一个既不在白名单、又没有源入口声明的子路径 → 门禁红（见 `resolveScanEntries()`）。
 * 反向也守：白名单登记了包里已不存在的入口，或登记的包已退出扫描范围，同样门禁红。
 *
 * 目前为空：`rxdb-adapter-miniprogram` 原先随包分发的 wa-sqlite glue + wasm 已改为
 * 直接依赖 `@subframe7536/sqlite-wasm`，资产不再经本仓库的 `exports` 暴露。
 *
 * `@aiao/rxdb-test/*`（5 个子路径）不在此列——整包已由 EXCLUDED 排除，非产品 API。
 * 三个 model 绑定包的 CSS 资产入口同理：`rxdb-model-angular` / `rxdb-model-vue` 的
 * `tailwind.css` 与 `rxdb-model-react` 的 `tailwind.css`、`index.css`（编译后的样式 bundle）
 * 都是 Tailwind `@source` 注册 / 样式产物，无 TS 导出表面，由消费方的 Tailwind 管线消费，
 * 内容为纯指令、无供应链风险面。
 * @type {Map<string, string[]>}
 */
const ASSET_SUBPATHS = new Map([
  ['rxdb-model-angular', ['./tailwind.css']],
  ['rxdb-model-react', ['./index.css', './tailwind.css']],
  ['rxdb-model-vue', ['./tailwind.css']]
]);

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
 * 判断某个导出符号是否经**仅类型**的导出/导入语法转出。
 *
 * 必要性：`kind` 若只读声明处的 flags，`export { Klass }` 与 `export type { Klass }`
 * 会得到同一个 `both` —— 而后者抽掉了运行时的值，所有 `new Klass()` / `extends Klass`
 * 的使用者当场炸。这正是本门禁要拦的破坏性变化，不能对它失明。
 *
 * 两种 AST 形状都要认：语句级 `export type { A, B } from '...'`（ExportDeclaration.isTypeOnly）
 * 与逐 specifier 的 `export { type A, b }`（ExportSpecifier.isTypeOnly）；`import type` 后
 * 再本地转出同理。
 * @param {import('typescript').Symbol} symbol 入口模块上的导出符号（别名解析**之前**的那个）
 */
function isTypeOnlyExport(symbol) {
  const declarations = symbol.declarations ?? [];
  if (declarations.length === 0) return false;
  // 同名符号有多处声明时，只要有一处是值形式转出，运行时就有这个值。
  return declarations.every(
    d =>
      (ts.isExportSpecifier(d) && (d.isTypeOnly || d.parent.parent.isTypeOnly)) ||
      (ts.isImportSpecifier(d) && (d.isTypeOnly || d.parent.parent.isTypeOnly))
  );
}

/**
 * 用 TypeScript 编译器解析入口文件真实可见的导出，返回 `{ name, kind }[]`。
 * kind: 'type' | 'value' | 'both'
 * @param {string} entryFile 入口路径（如 packages/rxdb-core/src/index.ts）
 * @param {string} srcDir 同包 src/ 目录，用于加载 .d.ts ambient 声明
 */
export function extractExports(entryFile, srcDir) {
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
    // `export type { X }` 只转类型，运行时没有这个值 —— 声明处是不是 class 都一样。
    const isValue = Boolean(resolved.flags & flags.Value) && !isTypeOnlyExport(symbol);
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

/**
 * SC-014 的可执行形式：`contracts/core-api.md` §0 那张表逐行搬到这里。
 *
 * 那张表的「门禁宿主」一栏指着本脚本，而基线 diff 只回答「增没增」，从不回答「增的这个
 * 叫什么」——命名规则因此一直只是文档里的一句话。下面是它缺的那一半。
 *
 * **正向规则（核心新增导出的前缀）读 diff，反向规则（禁用词）读当前全集。** 这不是不一致：
 * 反向规则若也读 diff，失效路径是现成的——新增 `IndexHint` → 门禁红 → 有人跑 `--update` →
 * 它进了基线 → `added` 空了 → 规则从此永远绿，而那个名字还在表面上。正向规则没有这条路可走
 * （「哪些名字属于本特性」在全集里读不出来），代价写在明处：它只在名字**第一次出现**的那次
 * 运行里有效。
 */
const NAMING = {
  /** 适用范围「`packages/rxdb` 核心共享契约」= 这一个包 */
  corePackage: 'rxdb',
  /** 核心新增导出允许的前缀 */
  corePrefixes: ['Commit', 'WorkingTree'],
  /**
   * 前缀规则的**逐名**例外，不是放宽前缀。
   *
   * 这三个是插件系统的扩展点上下文，与它们早已在基线里的同族 `RxDBBranchCreationContext`
   * 逐字同形；改叫 `WorkingTree*` 会让核心的插件系统看起来认识工作树，而它恰恰不认识
   * （`RxDBBranchSwitchPreconditions` 的 TSDoc 把这条「核心搬运、插件解释」的分工写死了）。
   * 用户侧那个 `WorkingTree*` 的名字在能力插件里：`WorkingTreeSwitchBranchOptions` 是本别名
   * 的再导出。
   *
   * 列成名单而不是加一条 `RxDBBranch` 前缀：加前缀之后第四个同族名字会静默通过，而这份名单
   * 逼着下一个人把理由重讲一遍。
   */
  corePrefixExceptions: [
    'RxDBBranchRemovalContext',
    'RxDBBranchSwitchContext',
    'RxDBBranchSwitchPreconditions',
    // `SwitchBranchOptions`（已在 grandfathered 名单里）的两个伴生名：`prepare` 的入参形状，
    // 与「这次调用没有分支要校验」的具名空实现。理由与上面三个同族：适配器契约刻意不认识工作树，
    // 叫 `WorkingTree*` 会让 `IRxDBAdapter` 看起来知道谁在用它。
    // `SKIP_BRANCH_SWITCH_PREPARE` 另有一层：它是 SCREAMING 形，而前缀判定是大小写敏感的
    // `startsWith('WorkingTree')`——任何常量名都不可能满足它，只能逐名登记。
    'SwitchBranchPrepareContext',
    'SKIP_BRANCH_SWITCH_PREPARE',
    // US-025 阶段 E 的增量合并原语。正向前缀规则的适用范围写的是「核心共享契约」，
    // 实现上却读整个 diff —— 于是任何与工作树无关的核心新增导出都会撞上它。
    // 这十二个是树查询外移到 `@aiao/rxdb-plugin-tree` 所需的 merge 引擎入口，
    // 叫 `Commit*` / `WorkingTree*` 只会让核心看起来把合并判定当成提交能力的一部分。
    // 按本表自己的规矩逐名登记，不放宽成前缀。
    'applyExternalEntityUpdate',
    'getEntityId',
    'IncrementalUpdateContext',
    'isStaleEntityEvent',
    'isStaleEntityRemoveEvent',
    'prepareIncrementalUpdate',
    'UpdateClassification',
    'UpdateDataCache',
    // active 哨兵 `'*active*'` 的分支 id 校验。它兑现的是 `ACTIVE_BRANCH_KEY` 那段 TSDoc
    // 立下的「`*` 不是合法命名字符」——此前只是注释，创建与导入路径没有一处兑现它。
    // 三条创建路径（`version/create-branch.ts` / `syncBranches` / pglite 适配器）都要调，
    // 必须在公开面上。与工作树无关，叫 `Commit*` / `WorkingTree*` 只会让核心看起来
    // 把「分支名合法性」当成提交能力的一部分。
    'assertUsableBranchId',
    'InvalidBranchIdError',
    // 创建边界的字段规范化。与早已在基线里的 `normalizeUpdateEntity` 是同一件事的两侧：
    // 两个适配器各带过一份按下标配对 `foreignKeyNames` / `foreignKeyColumnNames` 平行数组的
    // 副本，两边长度不等就把 A 的值写进 B 的列且完全无声。收进核心走 keyed 的
    // `foreignKeyRelationMap` 之后，适配器只剩 re-export。与工作树无关，
    // 叫 `Commit*` / `WorkingTree*` 等于宣称核心把「写 INSERT 前整理字段」当成提交能力。
    'normalizeCreateEntity',
    // 捕获挂载点注册表（`capture/capture-mount-points.ts`）。同族的三个类型
    // （`WorkingTreeCaptureMountPoint` / `...Ordinal` / `WorkingTreeWritePrimitiveSignature`）
    // 已按本规则改名带上前缀，不在这里；下面三个是**同一张表**的常量与谓词，形态上
    // 满足不了大小写敏感的 `startsWith('WorkingTree')`——SCREAMING 与 camelCase 都不行。
    // 登记的是形态豁免，不是「与工作树无关」：它们恰恰是工作树的表面。
    'WORKING_TREE_CAPTURE_MOUNT_POINTS',
    'WORKING_TREE_CAPTURE_MOUNT_POINT_METHODS',
    'isWorkingTreeCaptureMountPoint',
    // 指纹计算。自带 Repository 的插件必须给 `createTask` 传 `getFingerprint`，
    // 而指纹正是 QueryManager 判定「结果变没变」的依据——各写一份就是两套「变了」的定义。
    'Fingerprint',
    'getFingerprintByEntities',
    'getFingerprintByEntity',
    'getFingerprintPrimitive',
    // `@aiao/rxdb/testing` 的测试台符号。这个子路径依赖 vitest（可选 peer），不进生产主入口，
    // 也就不在「核心共享契约」的射程内——而正向规则读的是整个 diff，照样会把它们捞上来。
    // 叫成 `Commit*` / `WorkingTree*` 等于宣称核心把「造一个合并测试任务」当成提交能力。
    'collectEmissions',
    'cloneEntityClasses',
    'createHarnessQueryTask',
    'EntityCache',
    'HarnessSchemaOverrides',
    'HarnessTaskOptions',
    'METADATA',
    // 分支切换接管钩子的三个伴生名。与上面 T126 那三项同族、同文件：
    // `RxDBBranchSwitchTakeoverContext` 与 `RxDBBranchSwitchContext` 逐字段同形，差别只有
    // 「没有 `executor`」——接管方要拉远端快照、逐页落库，那些塞不进那次切换事务，
    // 必须自己开事务，这正是它不能共用前者的原因。理由与 T126 那三项一字不差：核心只搬运，
    // 叫 `WorkingTree*` 会让 `RxDBSystemContribution` 看起来认识工作树，而九个注册点没有一个提到它。
    // 这份名单当初写明「加前缀之后第四个同族名字会静默通过，而这份名单逼着下一个人把理由
    // 重讲一遍」——这就是那第四、五、六个，理由已重讲于上。
    'RxDBBranchSwitchTakeoverContext',
    'RxDBBranchSwitchTakeover',
    'RxDBBranchSwitchFailureContext',
    // FR-037 的能力闩。能力位是 `RxDBSystemContribution.capability` 的通用机制，工作树只是
    // 它的使用者之一；叫 `WorkingTree*` 等于宣称核心把「能力启用」当成提交能力专有的事。
    // `CAPABILITY_ENABLED_EVENT` 另有一层与 `WORKING_TREE_CAPTURE_MOUNT_POINTS` 相同的形态豁免：
    // SCREAMING 形永远满足不了大小写敏感的 `startsWith('WorkingTree')`。
    'CAPABILITY_ENABLED_EVENT',
    'CapabilityEnabledEvent',
    // `getEntityMutations` 的入参形状。那个函数本就在基线里（grandfathered 之前就公开），
    // 而它的选项类型此前没导出——包外要给这个对象起名只能写
    // `Parameters<typeof getEntityMutations>[0]`，或者照抄一份结构。抄出来的那份不会跟着改，
    // 于是字段改名的那天，抄件在类型层仍然绿。与工作树、提交能力都无关：
    // 它装的是「这批要写、那批要删」，叫 `Commit*` 等于宣称核心把批量写盘当成提交能力。
    'EntityMutationsOptions'
  ],
  /** 全部包都不许有的新前缀 */
  bannedPrefixes: ['Index', 'Workspace'],
  /** 全部包都不许有的名字：复用旧选项类型、复活 staging 词汇 */
  bannedNames: ['SwitchBranchOptions', 'stagedChange', 'unstageChange', 'stagedCount'],
  /**
   * 本特性之前就在基线里的那几个，逐名放行。
   *
   * 少了这份名单，门禁从第一次运行起就是红的——而一条恒红的门禁与没有门禁是同一件事。
   * 名单是封闭的：这里不接受新增。
   */
  grandfathered: {
    rxdb: ['SwitchBranchOptions'],
    'rxdb-plugin-workspace': [
      'WorkspaceCacheEntry',
      'WorkspaceCacheId',
      'WorkspaceCorruptedEntry',
      'WorkspaceFlushError'
    ]
  }
};

/**
 * 按 `contracts/core-api.md` §0 判一个包的导出命名。
 *
 * @param {{ pkg: string, currentNames: readonly string[], addedNames: readonly string[] }} input
 *   `currentNames` 是该包当前全部入口的导出名（去重后），`addedNames` 是相对基线新增的那些。
 * @returns {string[]} 违规说明，每条一个名字；合规时为空数组
 */
export function auditNaming({ pkg, currentNames, addedNames }) {
  const grandfathered = new Set(NAMING.grandfathered[pkg] ?? []);
  const problems = [];

  if (pkg === NAMING.corePackage) {
    for (const name of addedNames) {
      if (NAMING.corePrefixes.some(prefix => name.startsWith(prefix))) continue;
      if (NAMING.corePrefixExceptions.includes(name)) continue;
      problems.push(`核心新增导出 ${name} 不是 ${NAMING.corePrefixes.map(p => `${p}*`).join(' / ')} 前缀`);
    }
  }

  for (const name of new Set(currentNames)) {
    if (grandfathered.has(name)) continue;
    const prefix = NAMING.bannedPrefixes.find(candidate => name.startsWith(candidate));
    if (prefix !== undefined) problems.push(`${name} 用了禁用前缀 ${prefix}*`);
    else if (NAMING.bannedNames.includes(name)) problems.push(`${name} 是禁用名（旧选项类型 / staging 词汇）`);
  }

  return problems;
}

/** CLI 主流程：枚举包 → 提取表面 → 与基线比对（或重写基线）。 */
function main() {
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

  let naming = 0; // 命名违规（SC-014 / core-api.md §0）—— 改名，不是更新基线
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
      console.log(`⏭️  ${pkg}${subpath.slice(1)}: 资产入口，无导出表面（内容由供应链审计守护）`);
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
    // 命名门禁独立于「破坏性 / 漂移」那条轴：一个名字既可以只是新增（漂移）又同时犯规，
    // 而两者的处置相反——漂移跑 `--update` 就完了，犯规必须改名。合成一条的话，`--update`
    // 会把犯规的名字直接写进基线，从此再也不红。
    const namingProblems = auditNaming({
      pkg,
      currentNames: Object.values(current).flatMap(list => list.map(e => e.name)),
      addedNames: perEntry
        .flatMap(d => d.added)
        .concat(addedEntries.flatMap(subpath => current[subpath].map(e => e.name)))
    });
    if (namingProblems.length > 0) {
      naming++;
      console.log(`❌ ${pkg}: 命名违规（core-api.md §0）`);
      for (const problem of namingProblems) console.log(`   ${problem}`);
    }
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

  if (naming + breaking + drift + errors > 0) {
    console.log('');
    if (errors > 0) console.log(`📋 ${errors} 处解析失败 / 缺少基线文件 / 基线格式过期，请先排查 / 运行 --update。`);
    if (naming > 0) {
      console.log(
        `📋 ${naming} 个包存在命名违规（SC-014 / contracts/core-api.md §0）：` +
          `**改名**，不要跑 \`--update\`——更新基线只会把这个名字变成既成事实。`
      );
    }
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
    `\n✅ 全部 ${packages.length} 个公开包、${scannedEntries} 个公开入口的 API 表面与基线一致、命名合规` +
      `（另跳过 ${skippedAssetEntries} 个无导出表面的资产入口）。`
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
