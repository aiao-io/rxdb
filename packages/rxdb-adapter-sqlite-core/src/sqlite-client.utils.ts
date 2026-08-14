import type { SQLiteChangeType } from './sqlite-backend.interface.js';
import { RxDBAdapterSqliteError } from './sqlite-core.utils.js';

/**
 * SQLite update_hook 派发的单行变更事件载荷。
 * 由各后端 SqliteClient 收集后批量分发给 RxDB 上层。
 */
export interface ChangeRecordEvent {
  type: SQLiteChangeType;
  dbName: string;
  tableName: string;
  rowId: bigint;
}

/**
 * 变更事件批处理超时档位（毫秒）。
 * 越短延迟越低但 CPU 唤醒越频繁；越长越省电但 UI 响应延后。
 * - `IMMEDIATE` (0): 同步派发，仅在测试场景使用
 * - `FAST` (4):     约一帧内合并
 * - `BALANCED` (16): 默认值，约一帧（60fps）
 * - `POWER_SAVE` (50): 移动端 / 后台场景
 */
export const BATCH_TIMEOUT = {
  IMMEDIATE: 0,
  FAST: 4,
  BALANCED: 16,
  POWER_SAVE: 50
} as const;

/** 默认批处理超时（毫秒），约一帧 60fps。 */
export const DEFAULT_BATCH_TIMEOUT = BATCH_TIMEOUT.BALANCED;

/**
 * 批处理事件强制 flush 的硬上限（毫秒）。
 *
 * @remarks
 * `#schedule_batch_send` 每次新事件都会 clearTimeout + setTimeout 重置纯 debounce 定时器；
 * 持续写入（批量导入、迁移、紧凑 `save()` 循环）间隔小于 `batchTimeout` 时定时器永远被重置，
 * 永不触发——变更事件在整个写入期间都不会派发，`#pending_events` 无界增长。
 * 此上限保证自批次内首个待发事件起，最多 `MAX_BATCH_WAIT_MS` 后必定强制 flush 一次，
 * 不受后续事件持续到达影响。
 */
export const MAX_BATCH_WAIT_MS = 100;

/** 默认 SQLite 页缓存大小（KB），50 MB。 */
export const DEFAULT_CACHE_SIZE_KB = 50 * 1024;

/**
 * 校验 SQLite 客户端的整数数值选项。
 *
 * @param name - 选项名
 * @param value - 运行时输入值
 * @param defaultValue - 未提供时使用的默认值
 * @param options - 是否允许零
 * @returns 已校验的整数值
 */
export function validateSqliteNumericOption(
  name: string,
  value: unknown,
  defaultValue: number,
  options?: { allowZero?: boolean }
): number {
  if (value === undefined) return defaultValue;
  const minimum = options?.allowZero ? 0 : 1;
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new RxDBAdapterSqliteError(`options.${name} must be an integer >= ${minimum}, got ${String(value)}`);
  }
  return value as number;
}

/** WAL 模式下自动 checkpoint 的页阈值。 */
export const WAL_AUTOCHECKPOINT_PAGES = 1000;

/**
 * 触发实体事件派发的系统表集合。
 * 仅这三张表的 update_hook 事件会被上抛为 RxDBChange / RxDBBranch / RxDBMigration 事件。
 */
export const WATCH_TABLES = new Set(['rxdb$rxdb_change', 'rxdb$rxdb_branch', 'rxdb$rxdb_migration']);

const REGEXP_CACHE = new Map<string, RegExp>();
const REGEXP_CACHE_MAX = 128;

/**
 * 标准化数据库名为持久化文件路径。
 *
 * 去除首尾空白，自动补 `.sqlite3` 扩展名与根路径前缀，
 * 使得相同 dbName 在不同 backend 上得到一致的文件名。
 *
 * @remarks
 * OPFS 的文件名空间是扁平的，这里不做目录分隔符的归一化。
 * 早先把 `/` 与 `\` 一律替换成 `_`，`a/b`、`a\b`、`a_b` 会落到同一个物理文件
 * `/a_b.sqlite3` —— 两个逻辑上不同的库互相覆盖对方的数据，且没有任何诊断信号。
 * 归一化产生的是**确定性碰撞**，不存在既保留分隔符又不碰撞的编码，
 * 因此在入口直接拒绝。不含分隔符的库名文件路径与历史实现逐字一致，存量数据不受影响。
 *
 * @param dbName - 数据库逻辑名，不得包含 `/` 或 `\`
 * @returns 以 `/` 开头、以 `.sqlite3` 结尾的路径
 * @throws {RxDBAdapterSqliteError} dbName 含目录分隔符时
 */
export function get_persistent_db_file_name(dbName: string): string {
  const normalized = dbName.trim();
  if (/[\\/]/.test(normalized)) {
    throw new RxDBAdapterSqliteError(
      `dbName must not contain a path separator, got ${JSON.stringify(dbName)}. ` +
        'OPFS file names are flat: normalizing separators would map distinct database names ' +
        'onto one file and silently overwrite data. Use a name without "/" or "\\".'
    );
  }
  const fileName = normalized.endsWith('.sqlite3') ? normalized : `${normalized}.sqlite3`;
  return `/${fileName}`;
}

/**
 * 带 LRU-ish 缓存的 RegExp 工厂，供 SQLite `regexp` / `regexp_replace` 自定义函数复用。
 *
 * 缓存容量超过 128 时整体清空（简单防内存暴涨），pattern 超 1000 字符直接抛错防 ReDoS。
 *
 * @param pattern - 正则表达式源串
 * @param flags - 正则标志，默认空串
 * @returns 缓存的 RegExp 实例
 * @throws {Error} 当 pattern 长度超过 1000
 */
export function get_cached_regexp(pattern: string, flags = ''): RegExp {
  const key = `${pattern}\0${flags}`;
  let re = REGEXP_CACHE.get(key);
  if (!re) {
    if (pattern.length > 1000) throw new Error('regexp pattern too long');
    re = new RegExp(pattern, flags);
    if (REGEXP_CACHE.size >= REGEXP_CACHE_MAX) REGEXP_CACHE.clear();
    REGEXP_CACHE.set(key, re);
  }
  return re;
}

/**
 * 生成数据库连接初始化 PRAGMA SQL。
 *
 * OPFS 持久化场景启用 WAL + NORMAL synchronous（兼顾耐久性与性能）；
 * 非持久化（内存 / 临时）场景用 MEMORY journal + OFF synchronous 追求吞吐。
 *
 * @param cacheSize - SQLite page cache 大小（KB）
 * @param useOpfs - 是否使用 OPFS 后端
 * @returns 拼接好的多语句 PRAGMA SQL
 */
export function get_init_sql(cacheSize: number, useOpfs: boolean): string {
  const durabilitySql =
    useOpfs ?
      `
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA wal_autocheckpoint = ${WAL_AUTOCHECKPOINT_PAGES};
    `
    : `
      PRAGMA journal_mode = MEMORY;
      PRAGMA synchronous = OFF;
    `;

  return `
      PRAGMA temp_store = memory;
      PRAGMA foreign_keys = ON;
      PRAGMA cache_size = -${cacheSize};
      ${durabilitySql}
    `;
}
