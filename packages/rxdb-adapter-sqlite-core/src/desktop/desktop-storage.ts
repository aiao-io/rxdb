/**
 * 桌面存储配置的可辨识联合与校验。
 *
 * @module desktop-storage
 */

import { RxDBAdapterDesktopError } from './desktop-error.js';

/**
 * SQLite 单文件桌面存储。
 *
 * @remarks
 * `databaseName` 是**应用作用域内的逻辑名**，不是文件系统路径：renderer 无从得知、
 * 也不需要得知物理根目录。物理位置由 host 在自己的应用数据目录内解析（AC#3）。
 */
export interface DesktopSqliteFileStorage {
  readonly engine: 'sqlite';
  /** 应用作用域内的逻辑数据库名，例如 `app.sqlite3`。 */
  readonly databaseName: string;
}

/**
 * PGlite data directory 桌面存储。
 *
 * @remarks
 * 字段名刻意与 {@link DesktopSqliteFileStorage} 不同：PGlite 的 data directory 是**一个目录**，
 * 里面有多个文件，绝不能被描述或序列化成单文件数据库。本形状**不属于任何现有适配器**：
 * Tauri 侧永不支持（没有 Node 主进程可服务 PGlite 的同步 filesystem 契约），
 * Electron 侧要等 US-208 立起 `pglite-electron`。在那之前把它交给 SQLite 客户端，
 * 会被 {@link assertDesktopSqliteStorage} 以 `unsupported_runtime_engine` 拒绝。
 */
export interface DesktopPgliteDirectoryStorage {
  readonly engine: 'pglite';
  /** 应用作用域内的逻辑 data directory 名。 */
  readonly dataDirectoryName: string;
}

/** 桌面存储配置的可辨识联合，按 `engine` 区分。 */
export type DesktopStorage = DesktopSqliteFileStorage | DesktopPgliteDirectoryStorage;

/**
 * 逻辑数据库名允许的字符：不含任何路径分隔符，因此天然无法做目录穿越。
 *
 * @remarks
 * `@` 必须在集合内：RxDB 的本地库名恒为 `<dbName>@<RXDB_DB_NAME_SUFFIX>`，那个后缀被永久冻结，
 * 适配器从 `rxdb.config.dbName` 推导出的名字因此一定带 `@`。它既不是路径分隔符，
 * 也不在 Windows 的保留字符集里，加进来不削弱上面那条性质。
 */
const DATABASE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/;
const DATABASE_NAME_MAX_LENGTH = 128;

/**
 * Windows 保留设备名——白名单唯一挡不住的一类名字。
 *
 * @remarks
 * `CON`、`NUL`、`COM1` 这些在 Win32 命名空间里指向字符设备而不是文件，`CreateFile` 会连上设备本身。
 * 它们全都匹配 {@link DATABASE_NAME_PATTERN}，于是在 Windows 上失败点被推迟到 `open`，
 * 报出来的是 `open_failed` 这类含糊错误——而不是调用方能理解、且在三平台上一致的 `invalid_database_name`。
 *
 * 匹配的是**第一个 `.` 之前**的部分：`CON.sqlite3` 与 `CON` 在 Windows 上是同一个设备。
 * 大小写不敏感。`COM0`/`LPT0` 不在其列（Windows 只保留 1–9），上标数字变体（`COM¹`）
 * 本就落在 ASCII 白名单之外。
 */
const WINDOWS_RESERVED_DEVICE_NAME_PATTERN = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;

/**
 * 校验逻辑数据库名。
 *
 * @remarks
 * 入参来自 renderer，即便有 `contextIsolation` 也**不可信**，host 侧必须再校验一次。
 * 允许集是白名单而非黑名单：字符集里没有 `/`、`\`、`:`，也不允许以 `.` 开头，
 * 于是 `..`、绝对路径、盘符、`~` 展开、URL scheme 全部落在集合外，
 * 不需要逐一枚举攻击形态。{@link WINDOWS_RESERVED_DEVICE_NAME_PATTERN} 是唯一必须补的黑名单——
 * 那类名字合法却不指向文件。
 *
 * @param databaseName - 待校验的逻辑名
 * @throws 非法时抛 {@link RxDBAdapterDesktopError}，code 为 `invalid_database_name`
 */
export function assertValidDesktopDatabaseName(databaseName: string): void {
  if (typeof databaseName !== 'string') {
    throw new RxDBAdapterDesktopError('invalid_database_name', `database name must be a string`);
  }
  if (databaseName.length > DATABASE_NAME_MAX_LENGTH) {
    throw new RxDBAdapterDesktopError(
      'invalid_database_name',
      `database name exceeds ${DATABASE_NAME_MAX_LENGTH} characters`
    );
  }
  if (!DATABASE_NAME_PATTERN.test(databaseName)) {
    throw new RxDBAdapterDesktopError(
      'invalid_database_name',
      `database name must match ${String(DATABASE_NAME_PATTERN)}; it is an app-scoped logical name, not a path`
    );
  }
  if (WINDOWS_RESERVED_DEVICE_NAME_PATTERN.test(databaseName)) {
    throw new RxDBAdapterDesktopError(
      'invalid_database_name',
      `database name ${JSON.stringify(databaseName)} is a reserved Windows device name; ` +
        `it would open a character device instead of a file`
    );
  }
}

/**
 * 判断存储配置是否为 SQLite 单文件形状。
 *
 * @param value - 任意值，通常来自未校验的配置或 IPC 入参
 * @returns 是 SQLite 单文件存储时为 `true`
 */
export function isDesktopSqliteFileStorage(value: unknown): value is DesktopSqliteFileStorage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<DesktopSqliteFileStorage>;
  return candidate.engine === 'sqlite' && typeof candidate.databaseName === 'string';
}

/**
 * 判断存储配置是否为 PGlite data directory 形状。
 *
 * @param value - 任意值，通常来自未校验的配置或 IPC 入参
 * @returns 是 PGlite data directory 存储时为 `true`
 */
export function isDesktopPgliteDirectoryStorage(value: unknown): value is DesktopPgliteDirectoryStorage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<DesktopPgliteDirectoryStorage>;
  return candidate.engine === 'pglite' && typeof candidate.dataDirectoryName === 'string';
}

/**
 * 校验存储配置确实是本协议唯一承载的那个引擎——SQLite 单文件。
 *
 * @remarks
 * 引擎不对时直接抛错，**不回退**到 memory/OPFS/IndexedDB，也不静默切换引擎：
 * 用户必须能确信数据确实写进了他指定的那个后端（AC#4）。
 *
 * 判据里没有「运行时」这一维：适配器注册名已经把运行时写死了（`sqlite-electron` /
 * `sqlite-tauri`），能走到这里的调用方**只可能**是 SQLite 那一行，再传一个 `runtime`
 * 进来无非是让调用方自报家门——而它报什么都不改变结论。PGlite 将来由 US-208 的
 * `pglite-electron` 自己那条路径承载，与本函数无关。
 *
 * 类型层已经收敛过一次（`DesktopSqliteClient.connect` 只收 {@link DesktopSqliteFileStorage}），
 * 这里仍然重校验，因为 JavaScript 调用方可以绕过类型，而 host 侧解析 IPC 入参时也复用本函数。
 *
 * @param storage - 存储配置
 * @throws 引擎不受支持时抛 `unsupported_runtime_engine`；名字非法时抛 `invalid_database_name`
 */
export function assertDesktopSqliteStorage(storage: DesktopStorage): asserts storage is DesktopSqliteFileStorage {
  if (isDesktopSqliteFileStorage(storage)) {
    assertValidDesktopDatabaseName(storage.databaseName);
    return;
  }
  if (isDesktopPgliteDirectoryStorage(storage)) {
    throw new RxDBAdapterDesktopError(
      'unsupported_runtime_engine',
      'a PGlite data directory cannot be opened over the desktop SQLite protocol; ' +
        'electron support is tracked by US-208 as a separate adapter, and tauri will never have it ' +
        'because there is no Node main process to serve PGlite synchronous filesystem contract'
    );
  }
  throw new RxDBAdapterDesktopError(
    'unsupported_runtime_engine',
    `unknown desktop storage engine ${String((storage as { engine?: unknown }).engine)}`
  );
}
