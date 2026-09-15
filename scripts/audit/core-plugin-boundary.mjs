/**
 * scripts/audit/core-plugin-boundary.mjs
 *
 * 核心包与待抽出插件之间的**边界门禁**：`packages/rxdb/src/` 下的核心代码，对
 * `commit/` 与 `working-tree/` 这两个即将成为 `@aiao/rxdb-plugin-working-tree` 的目录，
 * 只能有**登记在案**的依赖。
 *
 * 触发路径：`pnpm audit:core-boundary`。
 *
 * 为什么要机械门禁，而不是抽包那天再一次性 grep：抽包是分阶段做的（先在核心内部把边界
 * 理顺，再建包搬迁）。中间这段时间里，核心多长出一条指向 `working-tree/` 的 import
 * **不产生任何编译错误**——它今天还在同一个包里。等到搬迁那天才发现，那条依赖已经
 * 长进了别的改动里，拆它要连带回滚不相干的东西。
 *
 * **双向判定**：未登记的依赖报出来，登记了却已经不存在的条目**同样**报出来。只报单向的话，
 * 这张表会变成只增不减的历史垃圾堆，而它的全部价值在于「还剩几条」是可信的。
 *
 * 不扫 `__tests__/`：spec 按定义要够得着被测实现，`__tests__/commit/**` 就是 `commit/` 的测试。
 * 哪些 spec 搬走、哪些留在核心并改写断言面，是搬迁那一步的事，不是本门禁的判据。
 *
 * 不用 TypeScript 解析器：判据全部落在词法层（谁 import 了哪个相对路径），而 scripts/ 下的
 * 审计脚本一律是零依赖 .mjs。注释与字符串的涂白层直接复用
 * `working-tree-suite-callsites.mjs` 已导出的那一份——再抄一份词法扫描器，两份迟早会分叉。
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { stripComments } from './working-tree-suite-callsites.mjs';

/** 被扫描的核心源码根，相对仓库根。 */
export const CORE_SOURCE_ROOT = 'packages/rxdb/src';

/** 即将随插件走的两个目录；相对 {@link CORE_SOURCE_ROOT}。 */
export const PLUGIN_DIRS = Object.freeze(['commit', 'working-tree']);

/** 不参与扫描的目录名；相对 {@link CORE_SOURCE_ROOT} 的顶层。 */
export const SCAN_EXCLUDED_DIRS = Object.freeze(['__tests__', ...PLUGIN_DIRS]);

/**
 * 尚未拆除的跨界依赖，键是 `来源文件·被依赖模块`（两者都相对 {@link CORE_SOURCE_ROOT}），
 * 值是**它今天还在这里的理由**。
 *
 * @remarks
 * 每一条都要能被读成一句话：「这条依赖要到哪一步才拆得掉，为什么现在拆不掉」。
 * 登记一条的成本必须高于顺手拆掉它——否则这张表会变成绕过门禁的快捷方式。
 *
 * 阶段 1（核心内部重排）结束时这张表就是下面这个样子；阶段 2（建包搬迁）结束时它必须为空。
 */
export const PENDING_BOUNDARY_CROSSINGS = Object.freeze({
  // —— 门面：`RxDB.workingTree` 与能力位，随门面一起走（阶段 2）——
  'RxDB.ts·commit/commit-capability.js': '能力位读取；`workingTree` 门面搬走时一并走',
  'RxDB.ts·working-tree/capture-hook.js': '捕获运行时的**实现**；核心只留 WorkingTreeCaptureRuntime 接口',
  'RxDB.ts·working-tree/working-tree-facade.js': 'WorkingTreeManager 本体，插件的公开门面',

  // —— 桶文件：抽包时整行删掉 ——
  'index.ts·commit/index.js': '公开面再导出；抽包时整行删除',
  'index.ts·working-tree/index.js': '公开面再导出；抽包时整行删除',

  // —— 系统表登记：等 SYSTEM_ENTITIES 降级成核心 4 张（阶段 2）——
  'system/system-entities.ts·commit/commit.entity.js': 'epic-006 十张系统表之一：提交节点',
  'system/system-entities.ts·commit/commit-branch-ref.entity.js': 'epic-006 十张系统表之一：分支 HEAD 引用',
  'system/system-entities.ts·commit/commit-change-set.entity.js': 'epic-006 十张系统表之一：提交变更集',
  'system/system-entities.ts·commit/commit-capability-state.entity.js': 'epic-006 十张系统表之一：能力协商状态',
  'system/system-entities.ts·working-tree/working-tree-entry.entity.js': 'epic-006 十张系统表之一：工作树条目',
  'system/system-entities.ts·working-tree/working-tree-state.entity.js': 'epic-006 十张系统表之一：工作树状态',
  'system/system-entities.ts·working-tree/working-tree-activation-state.entity.js':
    'epic-006 十张系统表之一：分支激活代数',
  'system/system-entities.ts·working-tree/working-tree-materialization-stage.entity.js':
    'epic-006 十张系统表之一：物化暂存',
  'system/system-entities.ts·working-tree/working-tree-materialization-page.entity.js':
    'epic-006 十张系统表之一：物化分页游标',
  'system/system-entities.ts·working-tree/working-tree-restore-session.entity.js': 'epic-006 十张系统表之一：恢复会话',

  // —— 系统迁移：整条 0004 会变成插件的 createMigrations()（阶段 2）——
  'system/migrations/0004-working-tree-commits.ts·commit/branch-commit-rows.js': '迁移里写 baseline 提交行',
  'system/migrations/0004-working-tree-commits.ts·commit/commit-capability-state.entity.js': '迁移里写能力协商初始行',
  'system/migrations/0004-working-tree-commits.ts·working-tree/activation-state.js': '迁移里写工作树初始 generation',

  // —— 建分支：新分支要同时落提交图的 baseline 与工作树的 generation（阶段 2）——
  'version/create-branch.ts·commit/branch-commit-rows.js': '建分支时写 baseline 提交；要等插件暴露建表后回调',
  'version/create-branch.ts·working-tree/activation-state.js': '建分支时分配 generation；同上'
});

/** 扫描到的一条跨界依赖。 */
const crossingKeyOf = (fromFile, toModule) => `${fromFile}·${toModule}`;

/** `from '…'` 与 `import('…')` 两种形态的模块说明符。 */
const SPECIFIER_RE = /(?:\bfrom\s*|\bimport\s*\(\s*)(['"])([^'"]+)\1/g;

/**
 * 从一份源码里取出全部模块说明符
 *
 * @param source - 源文件内容
 * @returns 去重前的说明符，按出现顺序
 *
 * @remarks
 * 先涂白注释：本仓库的 TSDoc 里大量出现 `见 `../working-tree/xxx.ts`` 这类**指路**文字，
 * 它们不是依赖。把注释算进来，这张登记表会被文档改动推着变，于是没人再信它。
 */
export const findSpecifiers = source => {
  const code = stripComments(source);
  const found = [];
  for (const match of code.matchAll(SPECIFIER_RE)) found.push(match[2]);
  return found;
};

/**
 * 判定一个说明符是否落进 {@link PLUGIN_DIRS}，是则返回它相对核心根的路径
 *
 * @param fromFile - 来源文件，相对 {@link CORE_SOURCE_ROOT}
 * @param specifier - 原样的模块说明符
 * @returns 命中时为被依赖模块的相对路径；否则 `undefined`
 *
 * @remarks
 * 只认相对说明符。包名（`rxjs` / `@aiao/utils`）到不了这两个目录，而 `@aiao/rxdb` 自指
 * 在核心包内部不存在——真出现了，它会以另一种形态（循环自依赖）被 lint 拦下。
 */
export const resolveCrossing = (fromFile, specifier) => {
  if (!specifier.startsWith('.')) return undefined;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), specifier));
  if (resolved.startsWith('..')) return undefined;
  const [top] = resolved.split('/');
  return PLUGIN_DIRS.includes(top) ? resolved : undefined;
};

/**
 * 扫一份源码，报出它对插件目录的全部依赖
 *
 * @param fromFile - 来源文件，相对 {@link CORE_SOURCE_ROOT}
 * @param source - 源文件内容
 * @returns 去重后的跨界键，按字典序
 */
export const auditSource = (fromFile, source) => {
  const keys = new Set();
  for (const specifier of findSpecifiers(source)) {
    const resolved = resolveCrossing(fromFile, specifier);
    if (resolved) keys.add(crossingKeyOf(fromFile, resolved));
  }
  return [...keys].sort();
};

/**
 * 列出核心根下要扫的 `.ts` 文件
 *
 * @param coreRoot - {@link CORE_SOURCE_ROOT} 的绝对路径
 * @returns 相对 `coreRoot` 的文件路径，按字典序
 */
export const collectCoreFiles = async coreRoot => {
  const walk = async relDir => {
    const entries = await readdir(path.join(coreRoot, relDir), { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const rel = relDir ? path.posix.join(relDir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        if (SCAN_EXCLUDED_DIRS.includes(rel)) continue;
        files.push(...(await walk(rel)));
      } else if (entry.name.endsWith('.ts')) {
        files.push(rel);
      }
    }
    return files;
  };
  return (await walk('')).sort();
};

/**
 * 跑一遍边界门禁
 *
 * @param options.coreRoot - 核心源码根的绝对路径
 * @param options.registry - 登记表；缺省即 {@link PENDING_BOUNDARY_CROSSINGS}
 * @returns `{ unregistered, stale }`，两者都空即通过
 */
export const auditBoundary = async ({ coreRoot, registry = PENDING_BOUNDARY_CROSSINGS }) => {
  const files = await collectCoreFiles(coreRoot);
  const found = new Set();
  for (const file of files) {
    const source = await readFile(path.join(coreRoot, file), 'utf8');
    for (const key of auditSource(file, source)) found.add(key);
  }
  const registered = new Set(Object.keys(registry));
  return {
    unregistered: [...found].filter(key => !registered.has(key)).sort(),
    stale: [...registered].filter(key => !found.has(key)).sort()
  };
};

const main = async () => {
  const { unregistered, stale } = await auditBoundary({ coreRoot: path.resolve(CORE_SOURCE_ROOT) });

  if (unregistered.length > 0) {
    console.error(`\n核心代码新增了 ${unregistered.length} 条未登记的插件目录依赖：\n`);
    for (const key of unregistered) console.error(`  ✗ ${key.replace('·', '  →  ')}`);
    console.error(
      '\n要么拆掉它（核心不该依赖将随插件走的代码），' +
        '\n要么在 PENDING_BOUNDARY_CROSSINGS 里登记，并写清它要到哪一步才拆得掉。\n'
    );
  }
  if (stale.length > 0) {
    console.error(`\nPENDING_BOUNDARY_CROSSINGS 里有 ${stale.length} 条已经不存在的依赖：\n`);
    for (const key of stale) console.error(`  ✗ ${key.replace('·', '  →  ')}`);
    console.error('\n依赖已拆除，把对应条目从登记表里删掉——留着它等于谎报「还剩几条」。\n');
  }
  if (unregistered.length > 0 || stale.length > 0) process.exitCode = 1;
  else console.log(`核心↔插件边界通过：${Object.keys(PENDING_BOUNDARY_CROSSINGS).length} 条待拆依赖，全部登记在案。`);
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
