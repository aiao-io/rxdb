import type { LocalBackendCandidate } from '@aiao/rxdb';
import { TAURI_ADAPTER_NAME } from '@aiao/rxdb-adapter-tauri';
import { isTauriRuntime } from './services/tauri-environment';
import setup_rxdb_desktop, { DESKTOP_DEMO_DB_NAME } from './setup_rxdb_desktop';
import setup_rxdb_wa_sqlite, { WEB_PREVIEW_DB_NAME } from './setup_rxdb_wa-sqlite';

/** wa-sqlite 适配器在 `RxDBAdapters` 注册表中的名字。 */
export const WA_SQLITE_ADAPTER_NAME = 'wa-sqlite';

/**
 * 本 demo 的本地后端候选表（US-207 E8）。**顺序即优先级。**
 *
 * @param runtime - 探针要检测的对象，实际调用时传 `globalThis`
 * @returns 交给 `@aiao/rxdb` 的 `selectLocalBackend()` 的候选表
 *
 * @remarks
 * 判定逻辑本身已经上移到 `@aiao/rxdb`，这里只剩「本应用有哪些候选」这份数据。
 * 装了包的用户照着抄的是这张表，不再是一段 `? :`。
 *
 * 桌面排在前面**不是风格问题**：Tauri 窗口里 OPFS 一样可用，两条探针会同时为真，
 * 靠顺序才选得中桌面。
 *
 * `runtime` 作参数而不是直接读 `globalThis`，一是为了单测能同时跑到两条分支，
 * 二是因为 `__TAURI_INTERNALS__` 由 Tauri 的初始化脚本注入 —— 模块求值期读它
 * 等于赌两段脚本的先后顺序，所以调用点都在惰性工厂里。
 */
export const localBackends = (runtime: unknown): readonly LocalBackendCandidate[] => [
  {
    adapter: TAURI_ADAPTER_NAME,
    dbName: DESKTOP_DEMO_DB_NAME,
    isAvailable: () => isTauriRuntime(runtime),
    create: setup_rxdb_desktop
  },
  {
    // 浏览器预览（`nx serve dev-rxdb-tauri`）里 `invoke` 无处可调，所以不能只留桌面一条路。
    // 这一条永远可用，因此它同时是「表里至少有一个可用候选」的保证 ——
    // 换句话说本 demo 不会走到 `RxDBLocalBackendUnavailableError`。
    adapter: WA_SQLITE_ADAPTER_NAME,
    dbName: WEB_PREVIEW_DB_NAME,
    isAvailable: () => true,
    create: setup_rxdb_wa_sqlite
  }
];
