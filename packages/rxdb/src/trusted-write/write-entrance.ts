/**
 * @fileoverview 写入口词汇表：核心有哪些写入口身份（epic-006「写入口语义矩阵」与「受信调用点登记表」）。
 *
 * @remarks
 * **只有词汇表，没有语义。** 「每个入口对捕获意味着什么」归 `@aiao/rxdb-plugin-working-tree`
 * 的 `classifyWriteEntrance`；这里只回答「一共有哪些入口」。
 *
 * 分家的判据是**谁改它**：入口的集合随核心 `version/` 下的调用点增减而变（新增一条批量重写路径
 * 就要新增一个入口），而每个入口判成 capture / 放行 / 拒绝，随捕获规则变。两者合在一起的话，
 * 核心加一个调用点要动插件的文件，而插件调一条捕获规则要动核心的文件。
 *
 * 词汇表必须与 `./trusted-write-intent.ts` 的登记表同处：登记表的每一行自带一个 `entrance`，
 * 隔开之后「登记了一个不存在的入口」就不再是编译错误。
 */

/**
 * 已登记的写入口身份
 *
 * @remarks
 * 与 spec.md 那张矩阵**不是**一一对应：矩阵行 4「只更新 `remoteId` / 同步水位 / 审计时间」不是
 * 一个入口而是**写了什么**（`pull()` 同一次往返里既写实体又推水位），它由 `columns` 与
 * `operation` 判出来；反过来 `unknown` 是一个入口却不是矩阵里的一行。硬掰成 11 对 11 的话，
 * 得给「只写元数据」编造一个并不存在的调用方。
 *
 * `unknown` 必须在册：fail-closed 需要一个**可被判定**的取值，没有它，未登记的调用方只能以
 * 类型断言的形态混进来，而那条路径上没有任何判定会运行。
 */
export const WRITE_ENTRANCES = [
  'crud',
  'domain_recompute',
  'remote_entity_apply',
  'cleanup_expired',
  'projection_rewrite',
  'metadata_only_prefetch',
  'query_cache_maintenance',
  'raw_write',
  'bulk_write',
  'notify_external_update',
  'unknown'
] as const;

/** {@link WRITE_ENTRANCES} 的值联合 */
export type WriteEntrance = (typeof WRITE_ENTRANCES)[number];
