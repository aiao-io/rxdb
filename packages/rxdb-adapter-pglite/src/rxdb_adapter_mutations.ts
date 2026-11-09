/**
 * T033-T042: 批量修改实体（创建/更新/删除）
 *
 * 从 RxDBAdapterPGlite.mutations() 提取的独立函数
 * 优化：
 * 1. 使用参数化查询
 * 2. 支持自定义 IMutationContext
 */

import {
  EntityStaticType,
  EntityType,
  getEntityMetadata,
  getEntityStatus,
  planMutationWrites,
  RxDBMutationsMap,
  toStorageConstraintViolationError
} from '@aiao/rxdb';
import generate_entity_deletes_sql from './entity/deletes_sql.js';
import generate_entity_inserts_sql from './entity/inserts_sql.js';
import generate_entity_update_sql from './entity/update_sql.js';
import {
  getEntityObjectFromResult,
  getMonotonicUpdatedAt,
  normalizeUpdateEntity,
  RxdbAdapterPGliteError
} from './pglite.utils.js';
import { generate_find_sql } from './query/query_sql.js';
import { PGliteRepository } from './repository/PGliteRepository.js';
import type { RxDBAdapterPGlite } from './RxDBAdapterPGlite.js';
import { dispatchUnloggedRemovals } from './unlogged-removal-events.js';

/** 每个实体这次的提交记录（提交值 + 提交时的编辑序号）：回查回填按它收尾，执行期间的新输入留作未保存改动 */
type Submissions = Map<object, { submitted: object; mark: number }>;

const rememberSubmission = (submissions: Submissions, entity: object, submitted: object): void => {
  submissions.set(entity, { submitted, mark: getEntityStatus(entity).writeMark(submitted) });
};

const updateCachedEntity = <T extends EntityType>(
  repo: PGliteRepository<T>,
  data: Record<string, unknown>,
  submissions: Submissions
): void => {
  const rawId = data['id'];
  const validNumber = typeof rawId === 'number' && Number.isFinite(rawId);
  if (typeof rawId !== 'string' && typeof rawId !== 'bigint' && !validNumber) {
    throw new RxdbAdapterPGliteError('Database row returned an invalid entity id', 'invalid_entity_id');
  }

  const id = rawId as EntityStaticType<T, 'idType'>;
  const entity = repo.getEntityRef(id);
  if (!entity) return;

  // 不再无条件归零 modified：applyWriteResult 按提交值收尾并按 patch 重算，执行期间的新输入留到下一次 save()。
  // 缓存里的若不是本批提交的那个实例（没有提交值），按「全部未提交」处理，等同外部合并、不丢编辑
  const state = getEntityStatus(entity);
  const { submitted, mark } = submissions.get(entity) ?? { submitted: {}, mark: state.writeMark({}) };
  state.applyWriteResult(data as Partial<InstanceType<T>>, submitted, mark);
  state.local = true;
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
  const submissions: Submissions = new Map();

  // ========== 处理 CREATE 操作 ==========
  const applyCreates = async (EntityType: T, entities: InstanceType<T>[]) => {
    entities.forEach(e => all_entities.add(e));
    const meta = getEntityMetadata(EntityType);

    // 生成 INSERT SQL；生成器读的就是这一刻的字段值
    for (const entity of entities) rememberSubmission(submissions, entity, { ...entity });
    const insertSql = await generate_entity_inserts_sql(
      meta,
      adapter.tableSet,
      entities,
      adapter.rxdb.context,
      adapter.encryptionContext
    );
    try {
      await adapter.query(insertSql);
    } catch (error) {
      // 存储约束违约归一（US-030）：CHECK 的冲突值——批量 INSERT 命中哪一行原生消息不说，
      // 全部候选行的值并列；区间排他的双方区间来自 DETAIL
      throw toStorageConstraintViolationError(
        error,
        meta,
        entities as unknown as ReadonlyArray<Record<string, unknown>>
      );
    }

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
      updateCachedEntity(repo, data, submissions);
    }
  };

  // ========== 处理 UPDATE 操作（按 patch 分组优化）==========
  const applyUpdates = async (EntityType: T, entities: InstanceType<T>[]) => {
    entities.forEach(e => all_entities.add(e));
    const meta = getEntityMetadata(EntityType);

    const repo = adapter.getRepository<typeof EntityType, PGliteRepository<typeof EntityType>>(EntityType);

    // 逐个实体生成 UPDATE SQL。没有可写差异（改了又改回、只动了只读字段）的不发 UPDATE：
    // 否则只剩 updatedAt / updatedBy 被改，凭空推进新鲜度并给变更日志追加一条空 UPDATE。
    // updatedAt 与单条仓储同口径单调：整批时刻只是首选值，落后于实体已有的时间就取 +1ms
    for (const entity of entities) {
      const patch = getEntityStatus(entity).patch;
      rememberSubmission(submissions, entity, patch);
      if (Object.keys(normalizeUpdateEntity(meta, patch)).length === 0) continue;
      const { sql, params } = await generate_entity_update_sql(meta, adapter.tableSet, entity, patch, {
        ...adapter.rxdb.context,
        returning: false,
        updatedAt: getMonotonicUpdatedAt(entity, now),
        encryption: adapter.encryptionContext
      });
      try {
        await adapter.query(sql, params);
      } catch (error) {
        throw toStorageConstraintViolationError(error, meta, [entity as unknown as Record<string, unknown>]);
      }
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
      updateCachedEntity(repo, data, submissions);
    }
  };

  // ========== 处理 DELETE 操作 ==========
  const applyRemoves = async (EntityType: T, entities: InstanceType<T>[]) => {
    if (entities.length === 0) return;
    const meta = getEntityMetadata(EntityType);

    // 生成 DELETE SQL
    for (const statement of generate_entity_deletes_sql(meta, adapter.tableSet, entities)) {
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
  };

  // 执行顺序：插入 → 更新 → 删除；声明了区间排他的实体，删除与更新提到全部插入之前
  // （「截旧 + 新开」一起保存时不经过重叠的中间态，US-030 AC#14，见核心 planMutationWrites）
  const apply = { create: applyCreates, update: applyUpdates, remove: applyRemoves };
  for (const step of planMutationWrites(mutations)) {
    await apply[step.kind](step.EntityType, step.entities);
  }
  dispatchUnloggedRemovals(
    adapter,
    [...mutations.remove.values()].flatMap(entities => [...entities]),
    now
  );

  return Array.from(all_entities);
};
