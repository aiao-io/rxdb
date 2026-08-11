/**
 * PGlite 适配器测试工具集
 *
 * 提供给适配器消费者（应用 e2e、第三方测试）复用的辅助函数：
 * 数据库命名、表/触发器清理、Entity Class 克隆（避免多 RxDB 实例注册冲突）。
 *
 * @packageDocumentation
 */

import { RXDB_UPGRADE_GUARD_TABLE_NAME, RXDB_WRITER_LEASE_TABLE_NAME, type EntityType } from '@aiao/rxdb';
import type { RxDBAdapterPGlite } from './RxDBAdapterPGlite.js';
import remove_all_triggers_sql from './table/remove_trigger_sql.js';
import { generateSwitchBranchSql } from './version/switch_branch.js';

/**
 * 生成唯一的测试数据库名称（带时间戳与随机后缀）。
 *
 * @returns 唯一数据库名
 * @public
 */
export const generateDbName = (): string => `db_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * 清理 PGlite 适配器持有的数据库：移除所有 trigger、TRUNCATE 业务与测试系统表、
 * 保留 writer lease/upgrade guard，复位 `rxdb_branch` 至 `main`，并重新装配版本分支 trigger。
 *
 * 用于测试 setup/teardown 之间快速重置数据库，避免重建 PGlite 实例的开销。
 *
 * 步骤：
 * 1. 清空 RxDB EntityManager 缓存
 * 2. DROP 所有版本分支 trigger
 * 3. TRUNCATE `public` / `rxdb` schema 下除 writer 协议表外的全部表（CASCADE）
 * 4. 重新插入默认 `main` 分支记录
 * 5. 重新装配 `main` 分支的 trigger
 *
 * @param adapter - 待清理的适配器实例
 * @public
 */
export const cleanup_db = async (adapter: RxDBAdapterPGlite): Promise<void> => {
  adapter.rxdb.entityManager.cleanAllCache();

  const remove_trigger_sql = remove_all_triggers_sql(adapter);
  if (remove_trigger_sql) {
    const statements = remove_trigger_sql.split('---STATEMENT_SEPARATOR---').filter((s: string) => s.trim());
    for (const stmt of statements) {
      await adapter.query(stmt.trim());
    }
  }

  const tableResult = await adapter.internalQuery(
    `SELECT schemaname, tablename FROM pg_tables
     WHERE schemaname IN ('public', 'rxdb')
       AND NOT (
         schemaname = 'rxdb'
         AND tablename IN ($1::text, $2::text)
       )`,
    [RXDB_UPGRADE_GUARD_TABLE_NAME, RXDB_WRITER_LEASE_TABLE_NAME]
  );

  if (tableResult.rows.length > 0) {
    const tableList = tableResult.rows
      .map(row => {
        const { schemaname, tablename } = row as { schemaname: string; tablename: string };
        return `"${schemaname}"."${tablename}"`;
      })
      .join(', ');
    await adapter.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
  }

  await adapter.query(
    `INSERT INTO "rxdb"."rxdb_branch" (id,activated,"fromChangeId",local,remote) VALUES ('main',TRUE,NULL,TRUE,FALSE)`
  );

  const sql = generateSwitchBranchSql(adapter, 'main');
  const triggerStatements = sql.split('---STATEMENT_SEPARATOR---').filter((s: string) => s.trim());
  for (const stmt of triggerStatements) {
    await adapter.query(stmt.trim());
  }

  adapter.rxdb.entityManager.cleanAllCache();
};

/**
 * 克隆 Entity Class 数组，避免 `Symbol(ɵEntityManager)` 冲突。
 *
 * 当同一组 Entity Class 需要被多个 RxDB 实例同时注册时（典型场景：单测内并发创建多个
 * 隔离的 adapter 实例），EntityManager 会因为 metadata symbol 重复而抛错。
 * 此函数为每个 EntityClass 创建一份 prototype 干净的副本，并复制其 metadata symbol、
 * 静态属性与可枚举 symbol，确保各副本互不干扰。
 *
 * 与 `@aiao/rxdb-adapter-sqlite-core/testing` 的同名函数行为完全一致。
 *
 * @param entities - 待克隆的 Entity Class 数组
 * @returns 克隆后的 Entity Class 数组，顺序与入参一致
 * @public
 */
export const cloneEntityClasses = (entities: EntityType[]): EntityType[] => {
  return entities.map(EntityClass => {
    const Clone = class extends (EntityClass as unknown as new (
      ...a: unknown[]
    ) => Record<string, unknown>) {} as unknown as EntityType;
    let metadataSymbol: symbol | undefined;
    let metadata: unknown;
    let currentCtor: object | null = EntityClass;

    while (currentCtor && !metadataSymbol) {
      metadataSymbol = Object.getOwnPropertySymbols(currentCtor).find(sym => sym.description === 'ɵMetadata');
      metadata = metadataSymbol ? Object.getOwnPropertyDescriptor(currentCtor, metadataSymbol)?.value : undefined;
      currentCtor = metadataSymbol ? null : Object.getPrototypeOf(currentCtor);
    }

    if (metadata && typeof metadata === 'object') {
      Object.defineProperty(Clone, metadataSymbol!, {
        value: Object.create(metadata as object),
        enumerable: false,
        configurable: true,
        writable: false
      });
    }

    for (const key of Object.getOwnPropertyNames(EntityClass)) {
      if (key === 'prototype' || key === 'length' || key === 'name') continue;
      const desc = Object.getOwnPropertyDescriptor(EntityClass, key);
      if (desc) Object.defineProperty(Clone, key, desc);
    }
    for (const sym of Object.getOwnPropertySymbols(EntityClass)) {
      if (sym === metadataSymbol || sym.description?.startsWith('ɵ')) continue;
      const desc = Object.getOwnPropertyDescriptor(EntityClass, sym);
      if (desc) {
        Object.defineProperty(Clone, sym, { ...desc, configurable: true });
      }
    }
    return Clone;
  });
};
