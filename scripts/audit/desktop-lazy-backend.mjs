/**
 * 桌面 demo 的**产物**门禁：本地后端两条分支必须各自成 chunk，且都不在首屏加载图里
 * （US-207 E11 / US-505 AC#10）。
 *
 * @remarks
 * 两个 demo 由同一份脚本参数化跑，**不复制第二份**：它们守的是同一条性质，抄一份出来
 * 只会让两边的判据各自漂移。差异集中在 {@link DEMOS} 一张表里。
 *
 * 为什么非得看产物：`setup_rxdb.spec.ts` 那几条静态门禁只认得源码里的写法（动态
 * `import()` 在不在、常量从哪来），而「有没有被摇进主 chunk」是打包器的判断。两者之间
 * 隔着 barrel 转出、`sideEffects` 声明、以及 workspace 里走 tsconfig paths 读**源码**
 * 这一层 —— 实测就发生过：`setup_rxdb.ts` 只 import 了一个字符串常量，适配器包的 barrel
 * 却把整个桌面传输客户端一起带进了 `main.js`。源码那几条门禁全绿，产物是错的。
 * E11 的原话是「改后需有产物断言，否则这条只是口头承诺」，这份脚本就是那句话的兑现。
 *
 * 判据是双向的：标记既要**不在**首屏图里，又要**在**某个非首屏 chunk 里。只查前半句的话，
 * 标记字符串哪天被改名，这道门禁会安静地变成一条永远通过的空断言。
 *
 * 前置：被检查的 demo 已 `nx build`。产物不在时**报错退出**而不是跳过 —— 一道会自己跳过的
 * 门禁等于没有。
 *
 * @example 检查全部（本地顺手跑）
 * ```bash
 * pnpm audit:lazy-backend
 * ```
 *
 * @example 只检查一个（CI 里各 demo 的 `audit-lazy-backend` target 这么调，
 * 因为 affected 可能只建了其中一个）
 * ```bash
 * node scripts/audit/desktop-lazy-backend.mjs dev-rxdb-electron
 * ```
 */

import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceRoot = process.cwd();

/**
 * 参与检查的 demo。新增桌面运行时（US-208 的 pglite 变体等）只加一项。
 */
export const DEMOS = [
  { project: 'dev-rxdb-electron', dist: 'dist/apps/dev-rxdb-electron/browser' },
  { project: 'dev-rxdb-tauri', dist: 'dist/apps/dev-rxdb-tauri/browser' }
];

/**
 * 必须落在惰性 chunk 里的标记字符串。
 *
 * @remarks
 * 挑选原则是**只出现在一条分支的实现里**，且在产物里以原样字符串存活（压缩器会重命名
 * 标识符，但不会动字符串字面量与被转出的类名）。
 *
 * 分两层，因为泄漏也分两种深度 —— 这不是冗余，是实测出来的：把 `desktop-environment.ts`
 * 的键名改回 `import` 之后重新打包，首屏图从 9 个 chunk 涨到 10 个，多出来的那个 6.7KB
 * chunk 里装的是**第一层**那几个名字；`file.*` 那层在更深的模块里，纹丝不动。
 * 只留第二层的话，这次回归会安静地通过。
 *
 * 第一层（barrel 表层）：错误类型与错误码。它们是适配器包 barrel 上最浅的一圈符号，
 * 「主 chunk 里有人从 barrel 里取了个常量」首先把它们带进来。
 *
 * 第二层（协议实现）：桌面宿主的文件协议方法名，以及 wa-sqlite 引擎的 wasm 文件名。
 * 到这一层说明整条分支的实现都进来了。
 *
 * 适配器名（`sqlite-electron` / `sqlite-tauri`）与 `__aiaoRxdbDesktopHost__` **不能**当标记：
 * 候选表要在建库之前就报出后端身份、探针要在建库之前判断运行时，这几个字面量本来就该
 * 待在主 chunk 里（正因如此它们在源码里是抄的字面量，见各 `setup_rxdb.ts` 的 TSDoc）。
 */
export const LAZY_MARKERS = [
  // 第一层：barrel 表层。
  'RxDBAdapterDesktopError',
  'host_unavailable',
  'protocol_violation',
  'session_closed',
  'unsupported_runtime_engine',
  // 第二层：协议实现。
  'file.writeBegin',
  'file.writeChunk',
  'file.lockAcquire',
  'wa-sqlite-async.wasm'
];

/**
 * 静态 import / re-export 的目标。
 *
 * @remarks
 * 只认引号，因此**不会**匹配动态形式 —— rolldown 在 `main.js` 里发的是
 * `` import(`./chunk-X.js`) ``（反引号），在 worker 里发的是 `import("./chunk-X.js")`
 * （紧跟左括号）。两者都以 `(` 或反引号开头，与这里要求的 `["']` 对不上。
 * 这个区分就是整份脚本的支点：匹配宽了，惰性 chunk 会被算进首屏图，门禁永远红。
 */
export const STATIC_IMPORT_PATTERN = /(?:^|[^.\w$])(?:from|import)\s*["'](\.\/[^"']+\.js)["']/g;

/** 动态 `import()` 的目标；只用于「这个 chunk 到底还够不够得着」的完整性检查。 */
export const DYNAMIC_IMPORT_PATTERN = /import\s*\(\s*[`"']([^`"']+\.js)[`"']\s*\)/g;

/** 取出 `index.html` 里直接加载或预载的 js —— 首屏图的种子。 */
export function eagerSeeds(html) {
  const seeds = new Set();
  for (const [, file] of html.matchAll(/(?:src|href)="([^"]+\.js)"/g)) seeds.add(path.basename(file));
  return seeds;
}

/**
 * 从种子出发沿**静态** import 走一遍，返回首屏必然求值的 chunk 集合。
 *
 * @param distDir - 产物目录
 * @param seeds - `index.html` 给出的入口
 * @returns 文件名集合
 */
export async function walkEagerGraph(distDir, seeds) {
  const eager = new Set();
  const queue = [...seeds];
  let staticEdges = 0;

  while (queue.length > 0) {
    const file = queue.pop();
    if (eager.has(file)) continue;
    eager.add(file);

    const source = await readFile(path.join(distDir, file), 'utf8');
    for (const [, target] of source.matchAll(STATIC_IMPORT_PATTERN)) {
      staticEdges += 1;
      queue.push(path.basename(target));
    }
  }

  // 走出零条边说明正则与产物的 import 写法对不上了（压缩器换了引号风格之类）——
  // 那样首屏图会退化成「只有 index.html 里那几个」，标记自然都"不在图里"，门禁假绿。
  assert.ok(staticEdges > 0, `${distDir}：沿静态 import 一条边都没走出去，正则多半与产物对不上了`);
  return eager;
}

/** 列出产物目录下的所有 js（含 worker 产物）。 */
export async function listChunks(distDir) {
  const entries = await readdir(distDir, { withFileTypes: true });
  return entries.filter(entry => entry.isFile() && entry.name.endsWith('.js')).map(entry => entry.name);
}

/**
 * 检查一个 demo；返回可读的结论行。
 *
 * @param demo - `{ project, dist }`；`dist` 相对仓库根，传绝对路径也认（单测的夹具走这条）
 */
export async function auditDemo({ project, dist }) {
  const distDir = path.resolve(workspaceRoot, dist);
  await stat(distDir).catch(() => {
    throw new Error(
      [
        `找不到 ${project} 的产物目录：${distDir}`,
        '',
        `请先执行：pnpm nx build ${project}`,
        '（本门禁读的是打包结果，没有产物就没有可断言的东西 —— 因此这里报错而不是跳过。）'
      ].join('\n')
    );
  });

  const html = await readFile(path.join(distDir, 'index.html'), 'utf8');
  const seeds = eagerSeeds(html);
  assert.ok(seeds.size > 0, `${project}：index.html 里一个 js 都没找到`);

  const chunks = await listChunks(distDir);
  for (const seed of seeds) {
    assert.ok(chunks.includes(seed), `${project}：index.html 引用了 ${seed}，但产物目录里没有这个文件`);
  }

  const eager = await walkEagerGraph(distDir, seeds);
  const sources = new Map();
  for (const chunk of chunks) sources.set(chunk, await readFile(path.join(distDir, chunk), 'utf8'));

  const failures = [];
  for (const marker of LAZY_MARKERS) {
    const carriers = chunks.filter(chunk => sources.get(chunk).includes(marker));
    const eagerCarriers = carriers.filter(chunk => eager.has(chunk));

    if (carriers.length === 0) {
      // 标记一个都没命中：多半是上游改了名字。此时"不在首屏图里"是真的，但毫无意义。
      failures.push(`  ${marker}：整个产物里都找不到 —— 标记已失效，请更新 LAZY_MARKERS`);
      continue;
    }
    if (eagerCarriers.length > 0) {
      failures.push(`  ${marker}：出现在首屏 chunk ${eagerCarriers.join('、')} 里`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      [
        `${project} 的本地后端没有按需加载：`,
        ...failures,
        '',
        `首屏图（${eager.size} 个 chunk）：${[...eager].sort().join('、')}`,
        '',
        '常见成因：主 chunk 里的某个模块从适配器包的 barrel 里 import 了东西 ——',
        '哪怕只是一个字符串常量，barrel 转出的实现也会跟着进来。',
        '对策见 `apps/*/src/app/setup_rxdb.ts` 里适配器名常量的 TSDoc。'
      ].join('\n')
    );
  }

  const lazyChunks = chunks.filter(chunk => !eager.has(chunk));
  const dynamicTargets = new Set();
  for (const chunk of eager) {
    for (const [, target] of sources.get(chunk).matchAll(DYNAMIC_IMPORT_PATTERN)) {
      dynamicTargets.add(path.basename(target));
    }
  }
  assert.ok(dynamicTargets.size > 0, `${project}：首屏图里一个动态 import() 都没有 —— 两条后端分支不可能是按需加载的`);

  return `✓ ${project}：首屏 ${eager.size} 个 chunk，惰性 ${lazyChunks.length} 个；${LAZY_MARKERS.length} 个标记全部只出现在惰性 chunk 里`;
}

/**
 * 解析命令行给出的 demo 子集。
 *
 * @remarks
 * 不认识的名字**报错**而不是静默算作空集：CI 里项目改名后，一道「什么都没检查」的
 * 门禁会一路绿到底。
 */
export function selectDemos(argv) {
  if (argv.length === 0) return DEMOS;

  return argv.map(name => {
    const demo = DEMOS.find(candidate => candidate.project === name);
    if (!demo) {
      throw new Error(`未知的 demo：${name}（可选：${DEMOS.map(({ project }) => project).join('、')}）`);
    }
    return demo;
  });
}

async function main() {
  const lines = [];
  for (const demo of selectDemos(process.argv.slice(2))) lines.push(await auditDemo(demo));
  console.log(['桌面 demo 本地后端按需加载审计（US-207 E11 / US-505 AC#10）', ...lines].join('\n'));
}

// 只在被当作命令行入口时执行；`desktop-lazy-backend.spec.mjs` import 本模块时不该跑审计
// （单测环境里两个 demo 的 dist 多半根本不存在，那会变成一次必然失败的 import）。
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
