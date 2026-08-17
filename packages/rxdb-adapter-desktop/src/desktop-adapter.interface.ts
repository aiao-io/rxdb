/**
 * 桌面适配器的公开选项。
 *
 * @module desktop-adapter.interface
 */

import type { IRxDBAdapterOptions } from '@aiao/rxdb';
import type { SqliteBaseOptions } from '@aiao/rxdb-adapter-sqlite-core';
import type { DesktopHostTransport } from './desktop-sqlite-client.js';
import type { DesktopRuntime } from './desktop-storage.js';

/** 适配器在 `RxDBAdapters` 注册表中的名字。 */
export const ADAPTER_NAME = 'desktop' as const;

/**
 * 由 RxDB 数据库名推导逻辑文件名时补的后缀。
 *
 * @remarks
 * 带扩展名是为了让用户在自己的应用数据目录里一眼认出这是个 SQLite 文件，
 * 而不是一堆看不出用途的裸名字。
 */
export const DEFAULT_DATABASE_SUFFIX = '.sqlite3';

/** 桌面适配器选项。 */
export interface DesktopOptions extends IRxDBAdapterOptions, SqliteBaseOptions {
  /**
   * 与 host 通信的传输层。
   *
   * @remarks
   * 省略时从 preload 注入的全局读取（见 `resolveDesktopHostTransport`）。
   * 显式传入主要用于测试，以及 renderer 之外的宿主（worker、Node 集成测试）。
   */
  transport?: DesktopHostTransport;
  /**
   * 覆盖逻辑数据库名。
   *
   * @remarks
   * 省略时按 `${rxdb.config.dbName}${DEFAULT_DATABASE_SUFFIX}` 推导。
   * 它是**应用作用域内的逻辑名**，不是路径；物理位置只有 host 知道（AC#3）。
   * 接管一个已存在的库、或多个 RxDB 实例要共用同一个文件时才需要显式指定。
   */
  databaseName?: string;
  /**
   * 变更事件的防抖窗口（毫秒），省略时用 host 的默认值。
   *
   * @remarks
   * 与 wasm 适配器的同名选项同义：窗口内的连续写入合并成一次派发。
   * 调小它降低响应延迟，调大它减少唤醒次数；无论怎么配，一批最多攒 `MAX_BATCH_WAIT_MS`。
   */
  batchTimeout?: number;
  /**
   * host 所在的桌面运行时，省略时按 `'electron'` 解读。
   *
   * @remarks
   * 只影响连接前那次能力矩阵校验的判据与措辞（Tauri 永不支持 PGlite）。
   * 真正的把关在 host 侧，但靠的**不是**这个字段：host 从不读它，是每个 host 实现本身
   * 就绑死了一个运行时（Electron 主进程用 `createDesktopSqliteHost`，Tauri 用 Rust 宿主），
   * 各自按自己那一行矩阵重新断言一次。
   */
  runtime?: DesktopRuntime;
}
