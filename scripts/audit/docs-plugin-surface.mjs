/**
 * 文档与插件运行期面的一致性门禁。
 *
 * @remarks
 * US-025 把历史/分支、推拉同步、QueryCache 读引擎搬出 core 之后，面向用户的文档成了唯一
 * 没有编译器看着的一面：代码改完、测试改完、story 记完，`website/docs` 里的示例仍旧调用
 * 已经不存在的方法，或者照着它装包装不齐。两种失效都不会让任何一条 CI 变红，却让
 * 「照官方指南升级」这条路径 100% 失败——比编译错误更难查，因为读者会先怀疑自己。
 *
 * 四条判据：
 *
 * 1. **移走的同步方法不得再挂在 `versionManager` 上。** 名单不是硬编码的断言，而是
 *    自校验的：每个名字都必须在 `SyncManager` 里存在、且在 `VersionManager` 里不存在。
 *    哪天有人把某个方法搬回历史侧，本条会先于文档扫描炸掉，名单因此不会悄悄过期。
 *    判据覆盖直接调用与**别名调用**——`const vm = rxdb.versionManager` 之后全程写
 *    `vm.syncRepository()` 是文档里最常见的形态（本仓库出问题的那份就是这么写的），
 *    调用行里根本不出现槽位名，只盯调用行的判据一条都抓不到。
 * 2. **用到槽位就得说清它从哪来。** 正文出现 `rxdb.versionManager` 的文档必须提到
 *    `@aiao/rxdb-plugin-history`，出现 `rxdb.syncManager` 的必须提到 `@aiao/rxdb-plugin-sync`。
 *    core 不再自动创建这两个实例，不提插件的示例读者照抄就是 `undefined`。
 * 3. **QueryCache 要三个包齐全。** `connect()` 连查读引擎与出站队列两个槽，
 *    前者来自 querycache 插件、后者来自 sync 插件，而 sync `inject: ['plugin:history']`。
 *    只列 querycache 一个包的指南，读者照做必撞 `RxDBMissingPluginError`。
 * 4. **列了包名不等于装上了。** 注册 `rxDBPluginQueryCache` 的示例必须把另外两个
 *    也 `use()` 上。`pnpm add` 三个包、却只 `use()` 一个的示例照抄仍然 100% 失败，
 *    而判据只数包名时它是绿的。
 *
 * 扫描范围是 `website/docs/**` 加 `packages|modules|apps` 各自一层下的 `README.md`：
 * 早先只点名三个插件包的 README，适配器 README 里那份「只 `use()` 了 querycache」的
 * QueryCache 示例因此躲过了整轮门禁——名单式的扫描范围本身就是一种漏检。
 * `website/docs/api/` 是 typedoc 生成物，不参与扫描——它的真相源是源码注释，改它没有意义。
 *
 * @example
 * ```bash
 * pnpm audit:docs-plugins
 * ```
 */

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** 随 US-025 阶段 D 从 `VersionManager` 搬到 `SyncManager` 的方法。 */
export const MOVED_SYNC_METHODS = [
  'bulkSync',
  'checkRepositoryUpdates',
  'cleanupExpired',
  'getAllRepositorySyncStatus',
  'getRepositoryDependencyGraph',
  'getRepositorySyncOrder',
  'getRepositorySyncStatus',
  'pull',
  'pullRepository',
  'push',
  'pushRepository',
  'refreshPullableCount',
  'sync',
  'syncBranches',
  'syncRepository'
];

/** 槽位 → 提供它的包。读到槽位名却不提包名的文档，等于教人拿 `undefined`。 */
export const SLOT_PACKAGES = {
  versionManager: '@aiao/rxdb-plugin-history',
  syncManager: '@aiao/rxdb-plugin-sync'
};

/** QueryCache 一条完整读写路径横跨的三个包，缺一个 `connect()` 就抛。 */
export const QUERYCACHE_PACKAGES = [
  '@aiao/rxdb-plugin-querycache',
  '@aiao/rxdb-plugin-sync',
  '@aiao/rxdb-plugin-history'
];

/** 类体里 `  foo(` / `  async foo(` 这一层缩进的方法名。 */
const methodNames = source => {
  const names = new Set();
  for (const match of source.matchAll(/^ {2}(?:async )?([a-zA-Z][\w]*)\s*[(<]/gm)) names.add(match[1]);
  return names;
};

/**
 * 校验搬迁名单本身仍然成立。
 *
 * @param versionManagerSource - `VersionManager.ts` 全文
 * @param syncManagerSource - `SyncManager.ts` 全文
 * @returns 名单与源码对不上的说明，全部成立时为空数组
 */
export const auditMovedList = (versionManagerSource, syncManagerSource) => {
  const stayed = methodNames(versionManagerSource);
  const moved = methodNames(syncManagerSource);
  const offenders = [];
  for (const name of MOVED_SYNC_METHODS) {
    if (!moved.has(name)) offenders.push(`SyncManager 上没有 ${name}()：名单已过期`);
    if (stayed.has(name)) offenders.push(`VersionManager 上仍有 ${name}()：它没有真的搬走`);
  }
  return offenders;
};

/**
 * 扫描一份文档。
 *
 * @param file - 用于报错的相对路径
 * @param text - 文档全文
 * @returns 该文件的问题说明
 */
export const auditDoc = (file, text) => {
  const lines = scannableLines(text);
  const offenders = [...movedMethodCalls(file, lines)];
  for (const [slot, pkg] of Object.entries(SLOT_PACKAGES)) {
    if (!text.includes(`rxdb.${slot}`) && !text.includes(`db.${slot}`)) continue;
    if (!text.includes(pkg)) offenders.push(`${file} -> 用到 ${slot} 却没提 ${pkg}`);
  }
  if (text.includes('rxDBPluginQueryCache')) {
    const missing = QUERYCACHE_PACKAGES.filter(pkg => !text.includes(pkg));
    if (missing.length > 0) offenders.push(`${file} -> QueryCache 示例缺包：${missing.join('、')}`);
  }
  // 判据挂在「示例真的注册了 querycache」上，不挂在「正文提到过这个名字」上：
  // 后者会把「本包导出 rxDBPluginQueryCache」这种纯说明也拖下水
  if (lines.some(({ line }) => line.includes('use(rxDBPluginQueryCache)'))) {
    const missing = QUERYCACHE_FACTORIES.filter(factory => !lines.some(({ line }) => line.includes(`use(${factory})`)));
    if (missing.length > 0) offenders.push(`${file} -> QueryCache 示例缺 use()：${missing.join('、')}`);
  }
  return offenders;
};

/**
 * 找出仍然调在 `versionManager` 上的同步方法，直接调用与别名调用都算。
 *
 * @param file - 用于报错的相对路径
 * @param lines - {@link scannableLines} 的结果
 * @returns 问题说明
 */
const movedMethodCalls = (file, lines) => {
  const aliases = versionManagerAliases(lines);
  const offenders = [];
  for (const { line, no } of lines) {
    const direct = MOVED_SYNC_METHODS.find(name => line.includes(`versionManager.${name}(`));
    if (direct !== undefined) offenders.push(`${file}:${no} -> versionManager.${direct}() 已移到 syncManager`);
    for (const alias of aliases) {
      const called = MOVED_SYNC_METHODS.find(name => line.includes(`${alias}.${name}(`));
      if (called !== undefined) {
        offenders.push(`${file}:${no} -> ${alias}.${called}() 走的是 versionManager，已移到 syncManager`);
      }
    }
  }
  return offenders;
};

/** 三个包各自的注册工厂名，与 {@link QUERYCACHE_PACKAGES} 一一对应。 */
export const QUERYCACHE_FACTORIES = ['rxDBPluginQueryCache', 'rxDBPluginSync', 'rxDBPluginHistory'];

/** `const vm = rxdb.versionManager` 这类槽位别名绑定。 */
const SLOT_ALIAS = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:rxdb|db)\.(versionManager|syncManager)\b/g;

/**
 * 摘出该参与判定的行。
 *
 * @param text - 文档全文
 * @returns `{ line, no }`，`no` 为 1 起的行号
 *
 * @remarks
 * ` ```diff ` 里的删除行就是「旧写法长这样」，迁移指南少不了它。别名绑定同样按这个口径
 * 过滤：`-const vm = rxdb.versionManager;` 只是在展示历史，把它登记成活别名，
 * 紧随其后的 `+await sync.push()` 这类正确写法就会被冤枉。
 */
const scannableLines = text => {
  const lines = [];
  let diffFence = false;
  text.split('\n').forEach((line, i) => {
    if (line.startsWith('```')) {
      diffFence = line.startsWith('```diff');
      return;
    }
    if (diffFence && line.startsWith('-')) return;
    lines.push({ line, no: i + 1 });
  });
  return lines;
};

/**
 * 收集绑到 `versionManager` 的别名。
 *
 * @param lines - {@link scannableLines} 的结果
 * @returns 别名标识符集合
 *
 * @remarks
 * 先收满再判调用，不按出现序边收边判：代码块的排布不保证「绑定一定写在调用之前」，
 * 单趟扫描会漏掉先给调用、后给完整示例的那种写法。
 * 绑到 `syncManager` 的别名**不收**——那正是迁移之后的正确写法。
 */
const versionManagerAliases = lines => {
  const aliases = new Set();
  for (const { line } of lines) {
    for (const match of line.matchAll(SLOT_ALIAS)) {
      if (match[2] === 'versionManager') aliases.add(match[1]);
    }
  }
  return aliases;
};

/** 递归收集 `.md`，跳过 typedoc 生成的 `api/`。 */
const collectDocs = async (dir, root, found = []) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'api') await collectDocs(full, root, found);
    else if (entry.isFile() && entry.name.endsWith('.md')) found.push(path.relative(root, full));
  }
  return found;
};

/**
 * 收集 `packages` / `modules` / `apps` 各自一层下的 `README.md`。
 *
 * @param root - 仓库根目录
 * @returns 相对仓库根的路径列表
 *
 * @remarks
 * 按目录扫而不是列名单：名单要人记得维护，而漏掉的那一份恰恰不会有人想起来——
 * 适配器 README 里那份只 `use()` 了 querycache 的示例就是这么躲过整轮门禁的。
 */
const collectReadmes = async root => {
  const found = [];
  for (const group of ['packages', 'modules', 'apps']) {
    const entries = await readdir(path.join(root, group), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const relative = path.join(group, entry.name, 'README.md');
      if (existsSync(path.join(root, relative))) found.push(relative);
    }
  }
  return found;
};

/**
 * 跑一次完整审计。
 *
 * @param options - `root` 为仓库根目录
 * @returns 全部问题说明与扫过的文件数
 */
export const run = async ({ root }) => {
  const [versionManagerSource, syncManagerSource] = await Promise.all([
    readFile(path.join(root, 'packages/rxdb-plugin-history/src/VersionManager.ts'), 'utf8'),
    readFile(path.join(root, 'packages/rxdb-plugin-sync/src/SyncManager.ts'), 'utf8')
  ]);
  const offenders = auditMovedList(versionManagerSource, syncManagerSource);
  const docsRoot = path.join(root, 'website/docs');
  const files = await collectDocs(docsRoot, root);
  const readmes = await collectReadmes(root);
  for (const file of [...files, ...readmes]) {
    offenders.push(...auditDoc(file, await readFile(path.join(root, file), 'utf8')));
  }
  return { offenders, scanned: files.length + readmes.length };
};

const main = async () => {
  const { offenders, scanned } = await run({ root: process.cwd() });
  if (offenders.length > 0) {
    console.error(`❌ 文档与插件运行期面不一致（${offenders.length} 处）：`);
    for (const o of offenders) console.error(`   ${o}`);
    console.error('\n对照表见 website/docs/migration/history-sync-plugins.md。');
    process.exit(1);
  }
  process.stdout.write(`✅ Docs plugin surface passed（扫描 ${scanned} 个文件）.\n`);
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
