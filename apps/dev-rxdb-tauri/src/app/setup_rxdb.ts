import type { RxDB } from '@aiao/rxdb';
import { DESKTOP_DEMO_DB_NAME, WEB_PREVIEW_DB_NAME } from './db-names';
import { selectLocalBackend, type LocalBackendCandidate } from './local-backend';
import { isTauriRuntime } from './services/tauri-environment';

/** wa-sqlite 适配器在 `RxDBAdapters` 注册表中的名字。 */
export const WA_SQLITE_ADAPTER_NAME = 'wa-sqlite';

/**
 * Tauri 适配器在 `RxDBAdapters` 注册表中的名字。
 *
 * @remarks
 * 这里刻意**抄一份字面量**，而不是 `import { TAURI_ADAPTER_NAME } from '@aiao/rxdb-adapter-tauri'`。
 * 本模块在主 chunk 里（候选表要在建库之前就能报出后端身份），而那句 import 会把适配器包的
 * barrel 拽进主 chunk —— 实测连 `createTauriHostTransport` 的 `rxdb_desktop_request` /
 * `rxdb-desktop-change` 一起进了 `main.js`，正是 US-207 E11 与 US-505 AC#10 要挡的
 * 「Tauri 传输客户端代码进浏览器 bundle」。上面 `WA_SQLITE_ADAPTER_NAME` 一直是字面量，
 * 同样是这个原因；两条候选现在口径一致。
 *
 * 抄字面量的代价由 `setup_rxdb.spec.ts` 兜住：那里 import 包里的常量并断言二者相等，
 * 单测走源码、不进产物，因此不花 bundle 的钱。名字漂了会当场变红。
 */
export const TAURI_ADAPTER_NAME = 'sqlite-tauri';

/**
 * 本 demo 的本地后端候选表（US-207 E8）。**顺序即优先级。**
 *
 * @param runtime - 探针要检测的对象，实际调用时传 `globalThis`
 * @returns 交给 {@link selectLocalBackend} 的候选表
 *
 * @remarks
 * 判定逻辑在同目录的 `local-backend.ts`，这里只剩「本应用有哪些候选」这份数据 ——
 * 装了包的用户照着抄的是这张表，不再是一段 `? :`。两者都留在应用里：判定只有二十来行，
 * 且输入全部来自应用，上移到框架层换不到复用（见 `local-backend.ts` 的 TSDoc）。
 *
 * 桌面排在前面**不是风格问题**：Tauri 窗口里 OPFS 一样可用，两条探针会同时为真，
 * 靠顺序才选得中桌面。
 *
 * `create` 走动态 `import()`（US-207 E11）：两个后端的实现因此各自成 chunk，
 * 只有被选中的那个会被下载、求值。库名走 `db-names.ts` 而不是从工厂模块里 import ——
 * 静态 import 常量会把整个模块拖回主 chunk，动态 import 也就白做了。
 *
 * `runtime` 作参数而不是直接读 `globalThis`，一是为了单测能同时跑到两条分支，
 * 二是因为 `__TAURI_INTERNALS__` 由 Tauri 的初始化脚本注入 —— 模块求值期读它
 * 等于赌两段脚本的先后顺序，所以调用点都在惰性工厂里。
 */
export const localBackends = (runtime: unknown): readonly LocalBackendCandidate<Promise<RxDB>>[] => [
  {
    adapter: TAURI_ADAPTER_NAME,
    dbName: DESKTOP_DEMO_DB_NAME,
    isAvailable: () => isTauriRuntime(runtime),
    create: async () => (await import('./setup_rxdb_desktop')).default()
  },
  {
    // 浏览器预览（`nx serve dev-rxdb-tauri`）里 `invoke` 无处可调，所以不能只留桌面一条路。
    // 这一条永远可用，因此它同时是「表里至少有一个可用候选」的保证 ——
    // 换句话说本 demo 不会走到 `RxDBLocalBackendUnavailableError`。
    adapter: WA_SQLITE_ADAPTER_NAME,
    dbName: WEB_PREVIEW_DB_NAME,
    isAvailable: () => true,
    create: async () => (await import('./setup_rxdb_wa-sqlite')).default()
  }
];

let selected: LocalBackendCandidate<Promise<RxDB>> | undefined;

/**
 * 本次运行选中的本地后端。**判定只做一次**，之后所有调用方读到同一个结果。
 *
 * @param runtime - 探针要检测的对象，实际调用时传 `globalThis`
 * @returns 选中的候选（适配器名、库名、工厂）
 *
 * @remarks
 * US-207 E10 要的「storage 插件后端跟随同一次判定」落在这里：`provideRxDB` 的工厂、
 * 连接用的适配器名、卡片上显示的后端身份，读的都是这一个结果，而不是各自再探一次。
 * 探针虽是纯函数、重复调用同样安全，但「同一次判定」写成三处调用就只是碰巧一致而已。
 *
 * `runtime` 只在**第一次**调用时被读取 —— 一个应用实例只有一个运行时，
 * 换一个 runtime 再调用不会重新判定。测试要覆盖两条分支时请直接组合
 * {@link localBackends} 与 `selectLocalBackend`。
 */
export const resolveLocalBackend = (runtime: unknown): LocalBackendCandidate<Promise<RxDB>> =>
  (selected ??= selectLocalBackend(localBackends(runtime)));

let database: Promise<RxDB> | undefined;

/**
 * 本 app 唯一的 RxDB 实例（尚未 `connect()`）。
 *
 * @returns 建库 Promise；重复调用返回**同一个** Promise
 *
 * @remarks
 * 一个 handle 同时交给两个消费者：`provideRxDB()` 拿它填 `inject(RxDB)`，
 * `startLocalDatabase()` 拿它做连接与启动计数。
 *
 * 必须是同一个 Promise 而不是两次调用：Angular 的 app initializer 是
 * `Promise.all` 并发跑的，`provideRxDB` 自带的那个还没 resolve 时
 * `inject(RxDB)` 会抛「尚未就绪」。让连接那一步 await 本函数，
 * 两个 initializer 就落在同一条依赖链上，不必猜谁先谁后。
 */
export const localDatabase = (): Promise<RxDB> => (database ??= resolveLocalBackend(globalThis).create());
