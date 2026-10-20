/**
 * @fileoverview 表名解析器（US-314 B1.1）：业务实体的完全限定表名、schema 与变更触发器函数名只从这里出。
 *
 * @remarks
 * 可写检出位在同一个库里各有一套业务表（库内影子表）。物理名今天只来自实体元数据，没有改写口：
 * 漏改一处，就会静默写进别的检出位的表。所以全包只留这一个入口，表集参数必填、不给默认值；
 * `scripts/audit/table-name-resolver.mjs` 守着「本文件之外不推物理名」。
 *
 * PGlite 用 schema 分套，表名不变：
 * - **主表集**（{@link WorktreeTableSet.MAIN}）：schema 就是命名空间，与引入检出位之前逐字相同，存量库零迁移。
 * - **影子表集**：有副本的实体落 schema `<命名空间>$<后缀>`；没有副本的实体（系统表、QueryCache、
 *   关掉变更日志的实体）照旧落命名空间本身。
 * PostgreSQL 的索引、函数按 schema 划分，触发器与约束按表划分，所以索引名、约束名、触发器名都不用跟着变；
 * 唯一要跟着换 schema 的是变更触发器函数（{@link getChangeTriggerFunctionName}）。
 */

import type { EntityMetadata, WorktreeTableSet } from '@aiao/rxdb';
import { quoteIdentifier } from './pglite.utils.js';

/**
 * 拼出形如 `"public"."users"` 的完全限定表名（带双引号转义）。
 *
 * @param entityName - 表名
 * @param namespace - schema 名，默认 `public`
 * @returns 双引号包裹的 `"schema"."table"` 字符串，可直接插入 SQL
 *
 * @remarks
 * 只拼字符串、不判表集。业务实体一律走 {@link getTableNameByMetadata}。
 */
export const getTableName = (entityName: string, namespace: string = 'public') =>
  `${quoteIdentifier(namespace)}.${quoteIdentifier(entityName)}`;

/**
 * 实体在给定表集里所在的 schema。
 *
 * @param metadata - 实体元数据
 * @param tableSet - 表集
 * @returns 未加引号的 schema 名：主表集或没有副本时就是命名空间，否则 `<命名空间>$<后缀>`
 */
export const getSchemaName = (metadata: EntityMetadata, tableSet: WorktreeTableSet): string =>
  tableSet.has(metadata) ? `${metadata.namespace}$${tableSet.suffix}` : metadata.namespace;

/**
 * 实体在给定表集里的完全限定表名。
 *
 * @param metadata - 实体元数据
 * @param tableSet - 表集
 * @returns 双引号包裹的 `"schema"."table"` 字符串
 */
export const getTableNameByMetadata = (metadata: EntityMetadata, tableSet: WorktreeTableSet) =>
  getTableName(metadata.tableName, getSchemaName(metadata, tableSet));

/**
 * 实体变更触发器函数的完全限定名：`"<schema>"."<表名>_change_trigger_fn"`。
 *
 * @param metadata - 实体元数据
 * @param tableSet - 表集
 * @returns 双引号包裹的函数名，可直接插入 SQL
 *
 * @remarks
 * 函数按 schema 划分：挂在逻辑命名空间下的话，影子表集的 `CREATE OR REPLACE FUNCTION` 会把主表集那份
 * （分支 id 是写死的字面量）静默换成自己的，主检出位此后的写入全记到别的分支名下。
 */
export const getChangeTriggerFunctionName = (metadata: EntityMetadata, tableSet: WorktreeTableSet): string =>
  `${quoteIdentifier(getSchemaName(metadata, tableSet))}.${quoteIdentifier(`${metadata.tableName}_change_trigger_fn`)}`;
