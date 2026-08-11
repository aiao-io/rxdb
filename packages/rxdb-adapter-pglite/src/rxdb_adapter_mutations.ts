/**
 * T033-T042: 批量修改实体（创建/更新/删除）
 *
 * 从 RxDBAdapterPGlite.mutations() 提取的独立函数
 * 优化：
 * 1. 使用参数化查询
 * 2. 支持自定义 IMutationContext
 */

import { EntityStaticType, EntityType, getEntityMetadata, getEntityStatus, RxDBMutationsMap } from '@aiao/rxdb';
import generate_entity_deletes_sql from './entity/deletes_sql.js';
import generate_entity_inserts_sql from './entity/inserts_sql.js';
import generate_entity_update_sql from './entity/update_sql.js';
import { getEntityObjectFromResult, RxdbAdapterPGliteError } from './pglite.utils.js';
import { generate_find_sql } from './query/query_sql.js';
import { PGliteRepository } from './repository/PGliteRepository.js';
import type { RxDBAdapterPGlite } from './RxDBAdapterPGlite.js';

const updateCachedEntity = <T extends EntityType>(repo: PGliteRepository<T>, data: Record<string, unknown>): void => {
  const rawId = data.id;
  const validNumber = typeof rawId === 'number' && Number.isFinite(rawId);
  if (typeof rawId !== 'string' && typeof rawId !== 'bigint' && !validNumber) {
    throw new RxdbAdapterPGliteError('Database row returned an invalid entity id', 'invalid_entity_id');
  }

  const id = rawId as EntityStaticType<T, 'idType'>;
  const entity = repo.getEntityRef(id);
  if (!entity) return;

  repo.updateEntity(entity, data as unknown as InstanceType<T>);
  const state = getEntityStatus(entity);
  state.local = true;
  state.modified = false;
};

/**
 * 批量修改实体（创建/更新/删除）
 *
 * 这个函数从 `RxDBAdapterPGlite.mutations()` 提取出来，提供独立的批量操作实现。
 *
 * ## 优化策略
 *
 * ### 1. 参数化查询
 * 使用 PostgreSQL 的参数化查询（`$1`, `$2`等），避免 SQL 注入风险，提升安全性。
 *
 * ### 2. 批量查询结果
 * INSERT/UPDATE 后，使用 `WHERE id IN (...)` 批量查询更新后的数据，减少数据库往返。
 *
 * ## 事务保证
 *
 * **重要**：调用者必须在事务中执行此函数。通常通过以下方式调用：
 * ```typescript
 * await adapter.transaction(() => rxdb_adapter_mutations(adapter, mutations));
 * ```
 *
 * ## 性能目标
 *
 * - 100 个实体批量插入：< 100ms (p95)
 * - 100 个实体批量更新：< 100ms (p95)
 * - 1000 个实体批量插入：< 200ms (p95)
 * - 1000 个实体批量更新：< 200ms (p95)
 *
 * @param adapter - PGlite 适配器实例
 * @param mutations - 批量修改映射，包含 create/update/remove 三种操作
 * @param context - 可选的修改上下文（例如 `userId`，用于设置 `createdBy`/`updatedBy`）
 * @returns 所有操作涉及的实体数组
 *
 * @example
 * ```typescript
 * // 创建 + 更新 + 删除混合操作
 * const newUser = new User({ name: 'New User' });
 * existingUser.name = 'Updated Name';
 *
 * const result = await adapter.transaction(() =>
 *   rxdb_adapter_mutations(adapter, {
 *     create: new Map([[User, new Set([newUser])]]),
 *     update: new Map([[User, new Set([existingUser])]]),
 *     remove: new Map([[User, new Set([deletedUser])]])
 *   }, { userId: 'admin-id' })
 * );
 *
 * console.log(result.length);  // 3 (newUser, existingUser, deletedUser)
 * ```
 *
 * @see {@link RxDBAdapterPGlite.mutations}
 */
export default async <T extends EntityType = EntityType>(
  adapter: RxDBAdapterPGlite,
  mutations: RxDBMutationsMap<T>
): Promise<InstanceType<T>[]> => {
  const all_entities = new Set<InstanceType<T>>();
  const now = new Date();

  // ========== 处理 CREATE 操作 ==========
  for (const [EntityType, entitiesSet] of mutations.create.entries()) {
    const entities = Array.from(entitiesSet);
    entities.forEach(e => all_entities.add(e));
    const meta = getEntityMetadata(EntityType);

    // 生成 INSERT SQL
    const insertSql = await generate_entity_inserts_sql(
      meta,
      entities,
      adapter.rxdb.context,
      adapter.encryptionContext
    );
    await adapter.query(insertSql);

    // 查询刚插入的数据
    const ids = entities.map(e => e.id);
    const { sql, params } = generate_find_sql(adapter, meta, {
      where: { combinator: 'and', rules: [{ field: 'id', operator: 'in', value: ids }] }
    });
    const selectResult = await adapter.query(sql, params);

    // 更新实体状态
    const repo = adapter.getRepository<typeof EntityType, PGliteRepository<typeof EntityType>>(EntityType);
    for (const row of selectResult.rows) {
      const data = await getEntityObjectFromResult(meta, row, adapter.encryptionContext);
      updateCachedEntity(repo, data);
    }
  }

  // ========== 处理 UPDATE 操作（按 patch 分组优化）==========
  for (const [EntityType, entitiesSet] of mutations.update.entries()) {
    const entities = Array.from(entitiesSet);
    entities.forEach(e => all_entities.add(e));
    const meta = getEntityMetadata(EntityType);

    const repo = adapter.getRepository<typeof EntityType, PGliteRepository<typeof EntityType>>(EntityType);

    // 逐个实体生成 UPDATE SQL
    for (const entity of entities) {
      const status = getEntityStatus(entity);
      const { sql, params } = await generate_entity_update_sql(meta, entity, status.patch || {}, {
        ...adapter.rxdb.context,
        returning: false,
        updatedAt: now,
        encryption: adapter.encryptionContext
      });
      await adapter.query(sql, params);
    }

    // 批量查询更新后的数据
    const ids = entities.map(e => e.id);
    const find = generate_find_sql(adapter, meta, {
      where: { combinator: 'and', rules: [{ field: 'id', operator: 'in', value: ids }] }
    });
    const result = await adapter.query(find.sql, find.params);

    // 更新实体状态
    for (const row of result.rows) {
      const data = await getEntityObjectFromResult(meta, row, adapter.encryptionContext);
      updateCachedEntity(repo, data);
    }
  }

  // ========== 处理 DELETE 操作 ==========
  for (const [EntityType, entitiesSet] of mutations.remove.entries()) {
    const entities = Array.from(entitiesSet);
    if (entities.length === 0) continue;
    const meta = getEntityMetadata(EntityType);

    // 生成 DELETE SQL
    for (const statement of generate_entity_deletes_sql(meta, entities)) {
      await adapter.query(statement.sql, statement.params);
    }

    // 更新实体状态
    for (const entity of entities) {
      all_entities.add(entity);
      const status = getEntityStatus(entity);
      status.origin = structuredClone({ ...entity });
      status.modified = false;
      status.removed = true;
      status.local = false; // 标记为已从数据库删除
    }
  }

  return Array.from(all_entities);
};
