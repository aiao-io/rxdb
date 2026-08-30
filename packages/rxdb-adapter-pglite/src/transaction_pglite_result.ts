/**
 * PGlite 事务结果处理工具函数
 *
 * 提供统一的接口处理 PGlite 查询结果：
 * 1. 从结果中创建或更新实体
 * 2. 管理实体缓存（包括 ID 和 rowId 双重索引）
 * 3. 标记已删除实体
 *
 * 设计原则（Good Taste）：
 * - 没有特殊情况分支，统一处理逻辑
 * - 充分信任上游数据质量
 * - 代码即文档，命名清晰
 *
 * @module transaction_pglite_result
 */

import { EntityStaticType, EntityType, getEntityMetadata, getEntityStatus } from '@aiao/rxdb';
import type { RxDBAdapterPGlite } from './RxDBAdapterPGlite.js';
import { getEntityObjectFromResult } from './pglite.utils.js';

/**
 * PGlite 查询执行结果
 */
export interface PGliteExecuteResult<T = Record<string, unknown>> {
  rows: T[];
  rowsAffected: number;
  elapsed: number;
}

/**
 * 从 PGlite 查询结果创建或重用实体
 *
 * 这是处理 SELECT/INSERT RETURNING/UPDATE RETURNING 结果的统一入口。
 *
 * ## 行为
 *
 * 1. **新实体**：如果 ID 在缓存中不存在，创建新实体并标记为 `local=true, modified=false`
 * 2. **已存在实体**：返回缓存中的同一实例（引用相等）
 * 3. **forcedUpdate=true**：强制更新已存在实体的所有字段
 * 4. **forcedUpdate=false**（默认）：不更新已存在实体
 *
 * ## 使用场景
 *
 * - **INSERT RETURNING**: 总是创建新实体
 * - **SELECT**: 查询结果，可能包含新旧实体
 * - **UPDATE RETURNING**: 需要 `forcedUpdate=true` 更新实体状态
 *
 * @param adapter - PGlite 适配器实例
 * @param EntityType - 实体类型
 * @param result - PGlite 查询执行结果
 * @param forcedUpdate - 是否强制更新已存在的实体
 * @returns 实体数组（新创建或重用的）
 *
 * @example
 * ```typescript
 * // SELECT 查询：重用缓存实体
 * const result = await execute_query(client, 'SELECT * FROM todos WHERE completed = $1', [false]);
 * const todos = transaction_pglite_result(adapter, Todo, result);
 *
 * // INSERT RETURNING：创建新实体
 * const insertResult = await execute_query(
 *   client,
 *   'INSERT INTO todos (id, title) VALUES ($1, $2) RETURNING *',
 *   ['new-id', 'New Todo']
 * );
 * const newTodo = transaction_pglite_result(adapter, Todo, insertResult)[0];
 *
 * // UPDATE RETURNING：强制更新实体
 * const updateResult = await execute_query(
 *   client,
 *   'UPDATE todos SET completed = true WHERE id = $1 RETURNING *',
 *   ['todo-id']
 * );
 * transaction_pglite_result(adapter, Todo, updateResult, true);
 * ```
 */
export const transaction_pglite_result = async <T extends EntityType>(
  adapter: RxDBAdapterPGlite,
  EntityType: T,
  result: PGliteExecuteResult,
  forcedUpdate: boolean = false
): Promise<InstanceType<T>[]> => {
  if (!result.rows || result.rows.length === 0) {
    return [];
  }

  const metadata = getEntityMetadata(EntityType);
  const entities: InstanceType<T>[] = [];
  const em = adapter.rxdb.entityManager;

  for (const row of result.rows) {
    const obj = await getEntityObjectFromResult(metadata, row, adapter.encryptionContext);
    const id = obj['id'] as EntityStaticType<T, 'idType'>;
    const entityData = obj as unknown as InstanceType<T>;

    // 检查实体是否已在缓存中
    let entity: InstanceType<T>;
    const has = em.hasEntityRef(EntityType, id);

    if (has) {
      // 实体已存在
      entity = em.getEntityRef(EntityType, id)!;

      // 始终更新计算属性（如 hasChildren），因为它们是从数据库动态计算的
      metadata.computedPropertyMap.forEach((prop, propName) => {
        if (propName in obj) {
          entity[propName as keyof InstanceType<T>] = obj[propName];
        }
      });

      if (forcedUpdate) {
        // 强制更新：覆盖所有字段
        const status = getEntityStatus(entity);
        status.origin = structuredClone(entityData);
        Object.assign(entity, obj);
        status.local = true;
        status.modified = false;
      }
      // 不更新时，直接返回缓存实例
    } else {
      // 新实体：创建并加入缓存
      entity = em.createEntityRef(EntityType, entityData);
    }

    const status = getEntityStatus(entity);
    status.local = true;
    status.modified = false;

    entities.push(entity);
  }

  return entities;
};

/**
 * 将实体标记为已删除（从缓存中移除）
 *
 * 用于 DELETE 操作后清理内存状态。实体不会被销毁，但会被标记为 `removed=true, local=false`。
 *
 * @param adapter - PGlite 适配器实例
 * @param EntityType - 实体类型
 * @param ids - 要删除的实体 ID 数组
 *
 * @example
 * ```typescript
 * // 删除后清理缓存
 * await execute_query(client, 'DELETE FROM todos WHERE id = ANY($1)', [todoIds]);
 * remove_entity_ids_from_cache(adapter, Todo, todoIds);
 * ```
 */
export const remove_entity_ids_from_cache = <T extends EntityType>(
  adapter: RxDBAdapterPGlite,
  EntityType: T,
  ids: EntityStaticType<T, 'idType'>[]
): void => {
  for (const id of ids) {
    const entity = adapter.rxdb.entityManager.getEntityRef(EntityType, id);
    if (entity) {
      const status = getEntityStatus(entity);
      status.local = false;
      status.removed = true;
      status.modified = false;
    }
  }
};
