import type { RxDB } from '@aiao/rxdb';
import { DESKTOP_ADAPTER_NAME } from '@aiao/rxdb-adapter-desktop';
import { isTauriRuntime } from './services/tauri-environment';
import setup_rxdb_desktop from './setup_rxdb_desktop';
import setup_rxdb_wa_sqlite from './setup_rxdb_wa-sqlite';

/** wa-sqlite 适配器在 `RxDBAdapters` 注册表中的名字。 */
export const WA_SQLITE_ADAPTER_NAME = 'wa-sqlite';

/** 一个本地后端：注册名与建库工厂，两者必须成对使用。 */
export interface LocalBackend {
  /** `RxDB.connect()` 要的适配器名。 */
  readonly adapter: string;
  /** `provideRxDB()` 要的工厂；运行在注入上下文中。 */
  readonly create: () => RxDB;
}

/**
 * 按运行时挑本地后端（US-210）。
 *
 * @param runtime - 待检测对象，实际调用时传 `globalThis`
 * @returns Tauri 窗口下是宿主持有的 SQLite 文件，浏览器预览下是 wa-sqlite
 *
 * @remarks
 * 浏览器预览（`nx serve dev-rxdb-tauri`）里 `invoke` 无处可调，所以不能只留 desktop 一条路；
 * 反过来，Tauri 窗口里走 wa-sqlite 就等于绕开了这个 demo 要演示的东西。
 *
 * 适配器名与工厂**打包返回**而不是两个独立函数：分开算的话，两处判定漂移会让
 * `provideRxDB` 注册的适配器和 initializer 要连的适配器对不上，
 * 而报错只会说「适配器不存在」，指不到真正的原因。
 */
export const selectLocalBackend = (runtime: unknown): LocalBackend =>
  isTauriRuntime(runtime)
    ? { adapter: DESKTOP_ADAPTER_NAME, create: setup_rxdb_desktop }
    : { adapter: WA_SQLITE_ADAPTER_NAME, create: setup_rxdb_wa_sqlite };
