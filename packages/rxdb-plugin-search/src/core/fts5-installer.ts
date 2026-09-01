/**
 * FTS5 安装器（pure-logic 模块）
 *
 * 本模块只暴露**纯函数**：从 entity metadata 抽取可搜索字段、计算 schema 签名、
 * 生成迁移记录名。**不涉及任何 SQL 执行 / RxDB adapter 调用**——这些副作用
 * 由后续 `installFtsForEntity()` 层（依赖 RxDB runtime）封装，便于单元化测试与替换。
 *
 * @packageDocumentation
 */

import type { EntityMetadata } from '@aiao/rxdb';
import { get_table_name_by_metadata, type FtsField } from '@aiao/rxdb-adapter-sqlite-core';
import { SearchEncryptedFieldError } from '../types.js';
import { SEARCHABLE_PROPERTY_TYPES } from './schema-validator.js';

/**
 * 单个 entity 的 FTS5 安装计划
 */
export interface FtsInstallPlan {
  /** 原表表名（FTS5 external-content 表 `_fts_<tableName>` 引用） */
  readonly tableName: string;
  /** SQLite 物理表名（含 namespace 前缀，如 `public$article`） */
  readonly sqlTableName?: string;
  /**
   * 实体的 `namespace`。
   *
   * @remarks
   * 两套后端把 namespace 落到了**不同的东西**上，所以这里必须与
   * {@link FtsInstallPlan.sqlTableName} 并存，不能二选一：
   * SQLite 没有 schema，适配器把 namespace 拼进表名（`public$article`）；
   * PostgreSQL 适配器则建真正的 schema，表是 `"public"."article"`。
   * pg 后端此前照搬 `sqlTableName`，于是所有 DDL 与查询都指向一张不存在的
   * `"public$article"`，真库上一律 42P01。
   */
  readonly namespace?: string;
  /** 原表主键列名（external-content 模式 `content_rowid`） */
  readonly primaryKey: string;
  /** 已抽取的可搜索字段列表 */
  readonly fields: readonly FtsField[];
  /** schema 签名（用于运行时漂移检测） */
  readonly signature: string;
}

/**
 * 从 EntityMetadata 中抽取 FTS5 安装计划。
 *
 * 仅扫描 `properties`（不含 `computedProperties`），筛选 `searchable === true`
 * 且类型为 `string` / `enum` / `stringArray` 的字段。`stringArray` 标记
 * `isArray = true`，触发器层会用 `json_each + group_concat` 子查询展开。
 *
 * @returns 当 entity 没有任何可搜索字段时返回 `null`，否则返回完整计划
 */
export const extractFtsPlanFromMetadata = (metadata: EntityMetadata): FtsInstallPlan | null => {
  const fields: FtsField[] = [];
  let primaryKey: string | undefined;
  for (const prop of metadata.properties) {
    if ('primary' in prop && prop.primary === true && primaryKey === undefined) {
      primaryKey = prop.columnName;
    }
    if ('searchable' in prop && prop.searchable === true && SEARCHABLE_PROPERTY_TYPES.has(String(prop.type))) {
      // 004-local-field-encryption FR-022 / T068：配置阶段拒绝 encrypted + searchable。
      if ((prop as { encrypted?: boolean }).encrypted === true) {
        throw new SearchEncryptedFieldError(metadata.tableName, prop.columnName);
      }
      fields.push({
        name: prop.columnName,
        isArray: String(prop.type) === 'stringArray'
      });
    }
  }
  if (fields.length === 0) return null;
  return {
    tableName: metadata.tableName,
    sqlTableName: get_table_name_by_metadata(metadata),
    namespace: metadata.namespace,
    primaryKey: primaryKey ?? 'id',
    fields,
    signature: computeFtsSchemaSignature(fields)
  };
};

/**
 * 当前索引侧的分词策略标识，参与 schema 签名。
 *
 * 变更此值即代表索引内容语义改变，既有安装会被判为漂移并触发重建。
 *
 * @remarks
 * `-v3`：CJK 索引同时写入 unigram 与 bigram，单字查询不再依赖 bigram 首字符；并继续在
 * CJK 段与紧邻的拉丁/数字之间补空格（SQLC-013）。
 * 不 bump 的话，`rxdb搜索` 在存量索引里仍是**一个** token，而查询侧照旧编译成
 * `("rxdb" OR "rxdb"*) AND "搜索"` —— 漂移检测放行，混排内容却永久零召回。
 */
const FTS_TOKENIZATION = 'unicode61+cjk-unigram-bigram-v3' as const;

/**
 * 计算 FTS5 schema 签名（确定性、字段顺序无关）。
 *
 * 用于运行时漂移检测：启动时对比 `_fts_<table>` 的真实列签名与当前
 * `extractFtsPlanFromMetadata` 输出的签名，不一致则抛 `SearchSchemaMismatchError`。
 */
export const computeFtsSchemaSignature = (fields: readonly FtsField[]): string => {
  const sorted = [...fields].sort((a, b) => a.name.localeCompare(b.name));
  // 分词方式必须进签名：只哈希字段名会让「换了索引侧变换」逃过漂移检测，
  // 既有安装继续用旧切法的索引，查询侧却已按新切法编译，整体失配且无任何警告。
  return JSON.stringify([FTS_TOKENIZATION, sorted.map(f => [f.name, f.isArray ? 1 : 0])]);
};

/**
 * 构造 FTS5 迁移记录名。
 *
 * 命名约定：`fts5__<table>__v<version>__<action>`
 * - `install`  → 创建虚拟表 + 三个 trigger
 * - `backfill` → 回填已存在原表的存量数据
 *
 * @param tableName - 原表表名
 * @param action - `install` 或 `backfill`
 * @param version - schema 版本号，默认 `1`
 */
export const ftsMigrationName = (tableName: string, action: 'install' | 'backfill', version = 1): string =>
  `fts5__${tableName}__v${version}__${action}`;
