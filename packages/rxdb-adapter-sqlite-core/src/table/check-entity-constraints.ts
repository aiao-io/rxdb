/**
 * @fileoverview SQLite family 的存储约束漂移检查（US-030 AC#10 / #11 / #16）。
 *
 * 只读比对：元数据确定性生成的名字集合与 `sqlite_master` 里的实际集合。差集与抛错由核心
 * `assertNoEntityConstraintDrift` 承担（两后端同一份），本文件只做 SQLite 方言的读取：
 * - `ck_` CHECK：没有独立的目录行，名字只存在于建表 SQL 文本里
 *   （`ALTER TABLE ADD CONSTRAINT CHECK` 也会重写该文本），所以解析 sql 文本；
 * - `uq_` 条件唯一索引：`sqlite_master` 里 `type = 'index'` 的行；
 * - `ex_` 区间排他：`sqlite_master` 里 `type = 'trigger'` 的行，每条约束两个（`_i` / `_u`），
 *   缺一个就是缺一道防线（只剩插入触发器时 UPDATE 能静默造出重叠，AC#12）。
 *
 * 每类对象只认自己的前缀。比对范围刻意收窄：外键约束（作者原名）、`idx_` 普通索引、
 * 系统 CRUD 触发器与 FTS 触发器都不在范围——否则每张既有表首次 `init()` 就被报「多余」（AC#16）。
 */

import type { EntityMetadata, EntityType, WorktreeTableSet } from '@aiao/rxdb';
import {
  assertNoEntityConstraintDrift,
  CHECK_NAME_PREFIX,
  EXCLUSION_NAME_PREFIX,
  exclusionTriggerNames,
  expectedCheckConstraintNames,
  expectedConditionalUniqueIndexNames,
  expectedExclusionConstraintNames,
  getEntityMetadata,
  UNIQUE_INDEX_NAME_PREFIX
} from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SqliteResult } from '../sqlite-core.interface.js';
import { get_storage_object_name, get_table_name_by_metadata } from '../table-name-resolver.js';
import { checkStorageDeclarationsSqlite, type StorageIndexCatalogEntry } from './check-storage-declarations.js';

/** 漂移检查只读查询的最小接口：引导事务执行器门面（`execute` 落在当前事务里，返回原生结果）。 */
type ConstraintCatalogQuerier = Pick<RxDBAdapterSqliteBase, never> & {
  execute(sql: string, bindings?: unknown[]): Promise<SqliteResult>;
};

/**
 * 剥离 SQL 字符串字面量（`'...'`，`''` 是转义），返回只含代码的文本。
 *
 * @remarks
 * 字面量里可以伪造 `CONSTRAINT "ck_..."` 片段（默认值 / CHECK 文本），
 * 不剥离就会解析出假约束名，让每次 connect 永久抛「多余」。SQLite 没有其他
 * 字面量形态需要处理（双引号是标识符、反引号也是标识符、注释不出现于
 * `sqlite_master.sql` 的回显形态之外——原始建表文本就是本文件输入）。
 */
const stripSqlStringLiterals = (sql: string): string => {
  let result = '';
  let index = 0;
  while (index < sql.length) {
    const quote = sql[index];
    if (quote !== "'") {
      result += quote;
      index += 1;
      continue;
    }
    index += 1; // 跳过开引号
    while (index < sql.length) {
      if (sql[index] === "'") {
        if (sql[index + 1] === "'") {
          index += 2; // '' 转义
          continue;
        }
        index += 1; // 闭引号
        break;
      }
      index += 1;
    }
    result += "''"; // 占位保持两侧长度稳定（对解析无影响）
  }
  return result;
};

/**
 * 从建表 SQL 文本里解析**命名 CHECK** 的名字（不含未命名的列级 CHECK）。
 *
 * - 只认名字后紧跟 `CHECK` 的条目：外键 / 唯一约束的名字同样可以合法地以 `ck_` 起头
 *   （`foreignKeys` 的约束名就是作者给的 name），只看前缀会把它们判成「多余」的 CHECK；
 * - 关键字大小写不敏感（用户迁移手写的合法小写形态同样要认）；
 * - 标识符接受双引号 / 反引号 / 无引号三种形态（SQLite 都合法，无引号也可以含非 ASCII 字母）；
 * - 调用前必须先 {@link stripSqlStringLiterals}，字符串字面量里的伪片段不算数。
 */
const NAMED_CHECK_PATTERN = /CONSTRAINT\s+(?:"([^"]+)"\s*|`([^`]+)`\s*|([\p{L}_][\p{L}\p{N}_$]*)\s+)CHECK\b/giu;

/** 从建表 SQL 文本里解析 `ck_` 起头的 CHECK 约束名集合。 */
const actualCheckNames = (createSql: string): Set<string> => {
  const names = new Set<string>();
  for (const match of stripSqlStringLiterals(createSql).matchAll(NAMED_CHECK_PATTERN)) {
    const name = match[1] ?? match[2] ?? match[3];
    if (name.startsWith(CHECK_NAME_PREFIX)) names.add(name);
  }
  return names;
};

/** 挂在该表上的某类对象（索引 / 触发器）里，以 `prefix` 起头的名字。 */
const actualObjectNames = async (
  adapter: ConstraintCatalogQuerier,
  type: 'index' | 'trigger',
  tableName: string,
  prefix: string
): Promise<string[]> => {
  const result = await adapter.execute(`SELECT name FROM sqlite_master WHERE type = ? AND tbl_name = ?`, [
    type,
    tableName
  ]);
  return (result.results[0]?.rows ?? []).map(row => String(row[0])).filter(name => name.startsWith(prefix));
};

/**
 * SQLite family 的漂移检查：元数据声明的 CHECK / 条件唯一索引 / 区间排他与库里的实际对象逐表比对。
 *
 * @param adapter - 引导事务执行器门面：`connect()` 引导期内 `ready()` 等的是当前
 *   connect promise，直接走 `adapter.query()` 会等自己、永久挂起，所以本函数必须
 *   在 {@link RxDBAdapterSqliteBase.bootstrapTransaction} 里以执行器调用
 * @param EntityTypes - 全部注册实体（含未声明 checks 的：删掉声明而未迁移的残留
 *   `ck_` 约束同样判为「多余」）
 * @throws {@link RxDBConstraintDriftError} 表缺失、或任一实体表出现缺失 / 多余的
 *   `ck_` / `uq_` / `ex_` 对象时（表缺失与约束漂移同口径 fail-fast，两后端一致）
 */
export const check_entity_constraints_sqlite = async (
  adapter: ConstraintCatalogQuerier,
  tableSet: WorktreeTableSet,
  EntityTypes: readonly EntityType[],
  resolveMetadata: (entity: EntityType) => EntityMetadata = getEntityMetadata
): Promise<void> => {
  for (const EntityType of EntityTypes) {
    const metadata = resolveMetadata(EntityType);
    const tableName = get_table_name_by_metadata(metadata, tableSet);
    const result = await adapter.execute(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`, [
      tableName
    ]);
    const rows = result.results[0]?.rows ?? [];
    // 表缺失：fail-fast（缺表补建排在漂移检查之前，走到这里表必在；真缺失就是
    // 异常状态，两后端同口径报漂移点名表缺失，不静默跳过）
    const tableMissing = rows.length === 0;
    const indexRows =
      tableMissing ?
        []
      : ((
          await adapter.execute(`SELECT name, sql FROM sqlite_master WHERE type = ? AND tbl_name = ?`, [
            'index',
            tableName
          ])
        ).results[0]?.rows ?? []);
    const indexes: StorageIndexCatalogEntry[] = indexRows.map(row => ({
      name: String(row[0]),
      sql: String(row[1] ?? '')
    }));
    const storage = await checkStorageDeclarationsSqlite(
      adapter,
      metadata,
      tableSet,
      tableName,
      String(rows[0]?.[0] ?? ''),
      indexes,
      tableMissing
    );
    const actual =
      tableMissing ?
        []
      : [
          ...actualCheckNames(String(rows[0][0] ?? '')),
          ...indexes.map(index => index.name).filter(name => name.startsWith(UNIQUE_INDEX_NAME_PREFIX)),
          ...(await actualObjectNames(adapter, 'trigger', tableName, EXCLUSION_NAME_PREFIX))
        ];
    actual.push(...storage.actual);
    assertNoEntityConstraintDrift({
      entity: metadata.name,
      tableName: metadata.tableName,
      tableMissing,
      expected: [
        ...expectedCheckConstraintNames(metadata),
        ...expectedConditionalUniqueIndexNames(metadata).map(name => get_storage_object_name(name, metadata, tableSet)),
        ...expectedExclusionConstraintNames(metadata).flatMap(name =>
          exclusionTriggerNames(get_storage_object_name(name, metadata, tableSet))
        ),
        ...storage.expected
      ],
      actual,
      changed: storage.changed
    });
  }
};
