/**
 * adapter 名 → 搜索后端的唯一真相表（US-703 AC#8）。
 *
 * 这张表取代了原来的 `SUPPORTED_SEARCH_ADAPTERS` 名单式判断。名单只能回答
 * 「在不在里面」，回答不了「为什么不在」——而这正是使用者需要的信息：
 * `supabase` 是**没有本地 SQL 连接**，`sqlite-electron` 是**宿主没注册 CJK 分词函数**，
 * `wa-sqlite-miniprogram` 是**尚未实测**。三种情况的处置完全不同，
 * 所以每条拒绝都必须带一个可判别的原因码（体现在 `SearchUnsupportedAdapterError.reason`）。
 *
 * 判定分两层，这里只是第一层（静态）。第二层是 {@link SearchBackend.assertCapabilities}，
 * 对着活连接实测——名字告诉不了我们这个 SQLite 构建有没有编进 FTS5。
 *
 * @packageDocumentation
 */

import { SearchUnsupportedAdapterError } from '../types.js';
import { createFts5Backend } from './fts5-backend.js';
import { createPgTsvectorBackend } from './pg/pg-backend.js';
import type { SearchBackend, SearchBackendId } from './search-backend.js';

/**
 * 登记状态。
 *
 * - `supported` —— 已实测放行
 * - `unverified` —— 引擎家族对得上，但该宿主环境本轮无法实测，暂不放行
 *
 * 「引擎家族对不上」的 adapter（`http` / `supabase` / …）不进这张表：
 * 它们缺的不是验证，是本地 SQL 连接本身。
 *
 * @public
 */
export type SearchBackendStatus = 'supported' | 'unverified';

/**
 * 单个 adapter 的登记项。
 *
 * @public
 */
export interface SearchBackendDescriptor {
  /** adapter 名，取自各适配器包导出的 `ADAPTER_NAME` */
  readonly adapter: string;
  /** 该 adapter 对应的后端 */
  readonly backend: SearchBackendId;
  /** 登记状态 */
  readonly status: SearchBackendStatus;
  /** `unverified` 时必须给出的可判别原因 */
  readonly reason?: string;
}

/**
 * 全部登记项。
 *
 * SQLite 家族里 `sqlite-wasm` / `sqlite` / `sqliteai` 能放行，是因为 CJK 索引依赖的
 * 自定义函数 `rxdb_fts_bigram` 注册在共享基类里（`Oo1ClientBase` 覆盖 `sqlite` + `sqliteai`，
 * `SqliteClient` 覆盖 `sqlite-wasm`），而不是各适配器各写一份。`wa-sqlite` 的注册函数
 * 虽也落在 `WaSqliteClientBase`，但其 npm 预编译 wasm 未编入 FTS5 模块，登记为
 * `unverified`（见下）。
 *
 * 桌面宿主（`sqlite-electron` / `sqlite-tauri`）走的是跨进程协议，SQL 在宿主侧执行，
 * 宿主并未注册该函数——它们不在表里，被拒时给出的原因也正是这一条。
 *
 * @public
 */
export const SEARCH_BACKEND_DESCRIPTORS: readonly SearchBackendDescriptor[] = Object.freeze([
  { adapter: 'sqlite-wasm', backend: 'fts5', status: 'supported' },
  {
    adapter: 'wa-sqlite',
    backend: 'fts5',
    status: 'unverified',
    // 决策（US-703 AC#8）：npm `wa-sqlite` 的预编译 wasm（dist/wa-sqlite-async.wasm）
    // 未编入 FTS5 模块（无 fts5/rtree/json1 符号），`CREATE VIRTUAL TABLE ... USING fts5`
    // 会抛 no such module。补 FTS5 必须用 `-DSQLITE_ENABLE_FTS5` 重编译 wasm，
    // 属构建管线变更，不在本轮范围，因此不放行。
    reason:
      'the wa-sqlite wasm build does not enable SQLITE_ENABLE_FTS5; ' +
      'full-text search requires recompiling the wasm with -DSQLITE_ENABLE_FTS5'
  },
  { adapter: 'sqlite', backend: 'fts5', status: 'supported' },
  { adapter: 'sqliteai', backend: 'fts5', status: 'supported' },
  { adapter: 'pglite', backend: 'pg-tsvector', status: 'supported' },
  {
    adapter: 'wa-sqlite-miniprogram',
    backend: 'fts5',
    status: 'unverified',
    // 决策 2（见 US-703 计划）：小程序宿主的 wa-sqlite 构建是否编进 FTS5 模块、
    // 能否注册自定义 SQL 函数，都必须在真机上实测，本轮没有实测环境，因此不放行。
    reason:
      'the miniprogram host has not been verified to provide the SQLite FTS5 module and custom SQL function registration; ' +
      'this requires a real device run before it can be admitted'
  }
] satisfies readonly SearchBackendDescriptor[]);

const DESCRIPTORS_BY_ADAPTER: ReadonlyMap<string, SearchBackendDescriptor> = new Map(
  SEARCH_BACKEND_DESCRIPTORS.map(descriptor => [descriptor.adapter, descriptor])
);

/**
 * 查登记项。
 *
 * @param adapter - adapter 名
 * @returns 登记项；完全未登记时返回 `undefined`
 * @public
 */
export const lookupSearchBackendDescriptor = (adapter: string | undefined): SearchBackendDescriptor | undefined =>
  adapter === undefined ? undefined : DESCRIPTORS_BY_ADAPTER.get(adapter);

/**
 * 按后端标识构造后端实例。
 *
 * @param id - 后端标识
 * @returns 后端实例
 * @public
 */
export const createSearchBackend = (id: SearchBackendId): SearchBackend =>
  id === 'fts5' ? createFts5Backend() : createPgTsvectorBackend();

/**
 * 解析当前 adapter 对应的搜索后端；不可用即抛。
 *
 * @param adapter - `rxdb.config.sync.local.adapter` 读出的 adapter key
 * @returns 后端实例
 * @throws {SearchUnsupportedAdapterError} adapter 未登记或登记为 `unverified`
 * @public
 */
export const resolveSearchBackend = (adapter: string | undefined): SearchBackend => {
  const descriptor = lookupSearchBackendDescriptor(adapter);
  if (!descriptor) {
    throw new SearchUnsupportedAdapterError(
      adapter === undefined || adapter === '' ? 'unknown' : adapter,
      'this adapter does not expose a local SQL connection with a supported full-text engine ' +
        '(supported: SQLite FTS5 family, PGlite)'
    );
  }
  if (descriptor.status !== 'supported') {
    throw new SearchUnsupportedAdapterError(descriptor.adapter, descriptor.reason);
  }
  return createSearchBackend(descriptor.backend);
};
