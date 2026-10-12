/**
 * @fileoverview SQLite family 的存储约束漂移检查（US-030 AC#10 / #11 / #16）。
 *
 * 只读比对：元数据确定性生成的约束名集合（阶段 A 只纳入 `ck_` 起头的对象）与
 * `sqlite_master` 里建表 SQL 文本中的实际约束名集合。差集与抛错由核心
 * `assertNoEntityConstraintDrift` 承担（两后端同一份），本文件只做 SQLite 方言的
 * 两件事：读 sql 文本、从文本里解析命名约束。
 *
 * SQLite 的 CHECK 约束没有独立的目录行，名字只存在于建表 SQL 文本里
 * （`ALTER TABLE ADD CONSTRAINT CHECK` 也会重写该文本），所以解析 sql 文本。
 * 比对范围刻意收窄：外键约束（作者原名）、`idx_` 普通索引、系统 CRUD 触发器与
 * FTS 触发器都不在范围——否则每张既有表首次 `init()` 就被报「多余」（AC#16）。
 */

import type { EntityType } from '@aiao/rxdb';
import {
  assertNoEntityConstraintDrift,
  expectedCheckConstraintNames,
  getEntityMetadata,
  inDriftScope
} from '@aiao/rxdb';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SqliteResult } from '../sqlite-core.interface.js';
import { get_table_name_by_metadata } from '../sqlite-core.utils.js';

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
 * 从建表 SQL 文本里解析**命名约束**的名字（不含未命名的列级 CHECK）。
 *
 * - `CONSTRAINT` 关键字大小写不敏感（用户迁移手写的合法小写形态同样要认）；
 * - 标识符接受双引号 / 反引号 / 无引号三种形态（SQLite 都合法）；
 * - 调用前必须先 {@link stripSqlStringLiterals}，字符串字面量里的伪片段不算数。
 */
const NAMED_CONSTRAINT_PATTERN = /CONSTRAINT\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_$]*))/gi;

/** 从建表 SQL 文本里解析 `ck_` 起头的约束名集合。 */
const actualCheckNames = (createSql: string): Set<string> => {
  const names = new Set<string>();
  for (const match of stripSqlStringLiterals(createSql).matchAll(NAMED_CONSTRAINT_PATTERN)) {
    const name = match[1] ?? match[2] ?? match[3];
    if (inDriftScope(name)) names.add(name);
  }
  return names;
};

/**
 * SQLite family 的漂移检查：元数据声明的 CHECK 与库里的实际 CHECK 逐表比对。
 *
 * @param adapter - 引导事务执行器门面：`connect()` 引导期内 `ready()` 等的是当前
 *   connect promise，直接走 `adapter.query()` 会等自己、永久挂起，所以本函数必须
 *   在 {@link RxDBAdapterSqliteBase.bootstrapTransaction} 里以执行器调用
 * @param EntityTypes - 全部注册实体（含未声明 checks 的：删掉声明而未迁移的残留
 *   `ck_` 约束同样判为「多余」）
 * @throws {@link RxDBConstraintDriftError} 表缺失、或任一实体表出现缺失 / 多余的
 *   `ck_` 约束时（表缺失与约束漂移同口径 fail-fast，两后端一致）
 */
export const check_entity_constraints_sqlite = async (
  adapter: ConstraintCatalogQuerier,
  EntityTypes: readonly EntityType[]
): Promise<void> => {
  for (const EntityType of EntityTypes) {
    const metadata = getEntityMetadata(EntityType);
    const tableName = get_table_name_by_metadata(metadata);
    const result = await adapter.execute(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`, [
      tableName
    ]);
    const rows = result.results[0]?.rows ?? [];
    // 表缺失：fail-fast（缺表补建排在漂移检查之前，走到这里表必在；真缺失就是
    // 异常状态，两后端同口径报漂移点名表缺失，不静默跳过）
    const tableMissing = rows.length === 0;
    const actual = tableMissing ? [] : [...actualCheckNames(String(rows[0][0] ?? ''))];
    assertNoEntityConstraintDrift({
      entity: metadata.name,
      tableName: metadata.tableName,
      tableMissing,
      expected: expectedCheckConstraintNames(metadata),
      actual
    });
  }
};
