import {
  EntityStaticType,
  EntityType,
  getEntityMetadata,
  getEntityStatus,
  planMutationWrites,
  RxDBMutationsMap,
  toStorageConstraintViolationError
} from '@aiao/rxdb';
import { generate_entity_deletes_sql } from './entity/deletes_sql.js';
import { generate_entity_inserts_sql, get_insert_column_count } from './entity/inserts_sql.js';
import { update_sql as generate_entity_update_sql } from './entity/update_sql.js';
import { generate_sql } from './query/query_sql.js';
import { MAIN_TABLE_ALIAS } from './query/query_sql.utils.js';
import type { RxDBAdapterSqliteBase } from './RxDBAdapterSqliteBase.js';
import {
  chunkBySqliteBindLimit,
  get_primary_key_column,
  getEntityObjectFromResult,
  getMonotonicUpdatedAt,
  normalizeUpdateEntity,
  quote_sql_identifier,
  ROWID
} from './sqlite-core.utils.js';
import { get_table_name_by_metadata } from './table-name-resolver.js';
import { dispatch_unlogged_removals } from './unlogged-removal-events.js';

export const rxdb_adapter_mutations = async <T extends EntityType = EntityType>(
  adapter: RxDBAdapterSqliteBase,
  mutations: RxDBMutationsMap<T>
): Promise<InstanceType<T>[]> => {
  const entity_instance_map = new Map<T, Map<EntityStaticType<T, 'idType'>, InstanceType<T>>>();
  const now = new Date();
  const em = adapter.rxdb.entityManager;
  const all_entities = new Set<InstanceType<T>>();

  // 每个实体这次的提交记录（提交值 + 提交时的编辑序号）：回查回填按它收尾，执行期间的新输入留作未保存改动
  const submissions = new Map<InstanceType<T>, { submitted: object; mark: number }>();
  const remember_submission = (entity: InstanceType<T>, submitted: object) =>
    submissions.set(entity, { submitted, mark: getEntityStatus(entity).writeMark(submitted) });

  const remember_entity_instance = (entityType: T, entity: InstanceType<T>) => {
    let inner = entity_instance_map.get(entityType);
    if (!inner) {
      inner = new Map();
      entity_instance_map.set(entityType, inner);
    }
    inner.set(entity.id, entity);
  };

  const sync_entities_by_ids = async (
    entityType: T,
    metadata: ReturnType<typeof getEntityMetadata>,
    ids: EntityStaticType<T, 'idType'>[]
  ) => {
    for (const idsChunk of chunkBySqliteBindLimit(ids)) {
      const params = [...idsChunk];
      const sql = generate_sql({
        tableName: get_table_name_by_metadata(metadata, adapter.tableSet),
        where: `${MAIN_TABLE_ALIAS}.${quote_sql_identifier(get_primary_key_column(metadata))} in (${params
          .map(() => '?')
          .join(',')})`,
        metadata
      });
      const sqliteSuccessResult = await adapter.query(sql, params);
      await sync_entities_from_result(entityType, sqliteSuccessResult);
    }
  };

  const sync_entities_from_result = async (
    entityType: T,
    sqliteSuccessResult: Awaited<ReturnType<typeof adapter.query>>
  ) => {
    const metadata = getEntityMetadata(entityType);

    // 结果集里的列名是物理列名，主键列可被 columnName 改写（SQLC-014）
    const primaryKeyColumn = get_primary_key_column(metadata);

    for (const { columns, rows } of sqliteSuccessResult.results) {
      const idIndex = columns.findIndex(c => c === primaryKeyColumn);
      const rowIdIndex = columns.findIndex(c => c === ROWID);
      if (idIndex === -1) continue;

      for (const row of rows) {
        const id = row[idIndex] as EntityStaticType<T, 'idType'>;
        const entityObjectData = await getEntityObjectFromResult<InstanceType<T>>(
          metadata,
          columns,
          row,
          adapter.encryptionContext
        );
        const entityInstance = entity_instance_map.get(entityType)?.get(id);

        // 单次 getEntityRef 同时完成存在性检查与实体获取
        const existing = em.getEntityRef(entityType, id) as InstanceType<T> | undefined;
        let entity: InstanceType<T> | undefined = existing ?? entityInstance;
        if (!entity) {
          // `createEntityRef` 现在如实返回 `EntityInstanceType<T>`（从前是 `any`，什么都接得住）。
          // 两者对任何**具体** `T` 都解析到同一个实例形状，但在 `T` 未定的泛型体内它们是两个
          // 各自延迟的条件类型，互不可赋值。与上面 `getEntityRef` 那行同一种桥接，不是放宽：
          // 本文件通篇说 `InstanceType<T>`，改用 `EntityInstanceType<T>` 会让 `T` 取默认
          // `EntityType` 时实例退化成 `object`，`id` 当场消失。
          entity = em.createEntityRef(entityType, entityObjectData) as InstanceType<T>;
        } else if (!existing) {
          em.addEntityCache(entity);
        }

        const targetEntity = entity!;
        // 不再无条件归零 modified：执行期间的新输入要留到下一次 save()。
        // 本批提交过的实例按提交记录收尾（applyWriteResult：以回查的行推进基线，提交之后的新编辑保留）；
        // 回查命中的若不是本批提交的那个实例（例如缓存槽里是同 id 的另一个实例），没有提交值可言，
        // 那一行对它就是外部数据，走 applyExternal——外部数据落到已缓存实体的唯一策略入口，逐字段避让未保存编辑
        const state = getEntityStatus(targetEntity);
        const submission = submissions.get(targetEntity);
        if (submission) state.applyWriteResult(entityObjectData, submission.submitted, submission.mark);
        else state.applyExternal(entityObjectData);
        state.local = true;

        if (rowIdIndex !== -1) {
          const rowId = BigInt(row[rowIdIndex] as number);
          adapter.cacheRowIdEntity(rowId, targetEntity);
        }
      }
    }
  };

  // 创建 SQL
  const apply_creates = async (EntityType: T, entities: InstanceType<T>[]) => {
    for (const entity of entities) {
      all_entities.add(entity);
      remember_entity_instance(EntityType, entity);
    }
    const meta = getEntityMetadata(EntityType);

    for (const entitiesChunk of chunkBySqliteBindLimit(entities, get_insert_column_count(meta))) {
      for (const entity of entitiesChunk) remember_submission(entity, { ...entity });
      const insert_result = await generate_entity_inserts_sql(
        meta,
        adapter.tableSet,
        entitiesChunk,
        adapter.rxdb.context,
        adapter.encryptionContext
      );
      try {
        await adapter.query(insert_result.sql, insert_result.params);
      } catch (error) {
        // 存储约束违约归一（US-030）：CHECK 的冲突值——批量 INSERT 命中哪一行原生消息不说，
        // 全部候选行的值并列；区间排他的双方区间来自触发器消息
        throw toStorageConstraintViolationError(
          error,
          meta,
          entitiesChunk as unknown as ReadonlyArray<Record<string, unknown>>
        );
      }
    }

    await sync_entities_by_ids(
      EntityType,
      meta,
      entities.map(entity => entity.id)
    );
  };

  // 更新 SQL
  const apply_updates = async (EntityType: T, entities: InstanceType<T>[]) => {
    for (const entity of entities) {
      all_entities.add(entity);
      remember_entity_instance(EntityType, entity);
    }
    const meta = getEntityMetadata(EntityType);

    for (const entity of entities) {
      const patch = getEntityStatus(entity).patch;
      remember_submission(entity, patch);
      // 按归一后的 patch 判空：只读属性在实例上可以赋值，normalizeUpdateEntity 会把它们滤掉，
      // 只剩只读编辑的 patch 归一后为空，update_sql 对空 patch 直接抛错——整批就此失败
      if (Object.keys(normalizeUpdateEntity(meta, patch)).length === 0) continue;

      const updateResult = await generate_entity_update_sql(meta, adapter.tableSet, entity, patch, {
        ...adapter.rxdb.context,
        encryption: adapter.encryptionContext,
        returning: false,
        updatedAt: getMonotonicUpdatedAt(entity, now)
      });
      try {
        await adapter.query(updateResult.sql, updateResult.params);
      } catch (error) {
        throw toStorageConstraintViolationError(error, meta, [entity as unknown as Record<string, unknown>]);
      }
    }

    await sync_entities_by_ids(
      EntityType,
      meta,
      entities.map(entity => entity.id)
    );
  };

  // 删除 SQL
  const apply_removes = async (EntityType: T, entities: InstanceType<T>[]) => {
    for (const entity of entities) all_entities.add(entity);
    const meta = getEntityMetadata(EntityType);
    if (entities.length > 0) {
      const delete_sql = generate_entity_deletes_sql(meta, adapter.tableSet, entities);
      await adapter.query(delete_sql);
    }
  };

  // 执行顺序：插入 → 更新 → 删除；声明了区间排他的实体，删除与更新提到全部插入之前
  // （「截旧 + 新开」一起保存时不经过重叠的中间态，US-030 AC#14，见核心 planMutationWrites）
  const apply = { create: apply_creates, update: apply_updates, remove: apply_removes };
  for (const step of planMutationWrites(mutations)) {
    await apply[step.kind](step.EntityType, step.entities);
  }
  // 在下面标 removed、清缓存之前取快照：事件里的 inversePatch 要的是删之前的值
  dispatch_unlogged_removals(
    adapter.rxdb,
    [...mutations.remove.values()].flatMap(entities => [...entities]),
    now
  );

  // 更新 remove 实体状态（上面已加入 all_entities，这里只需同步状态）
  mutations.remove.forEach(entities =>
    entities.forEach(entity => {
      const status = getEntityStatus(entity);
      status.origin = structuredClone({ ...entity });
      status.modified = false;
      status.removed = true;
      status.local = false; // 标记为已从数据库删除
      // 同 transaction_sqlite_result 的 remove_entity_ids_from_cache：
      // rowid 强引用必须随删除回收，否则长生命周期增删场景内存单调增长（SQLC-033）
      adapter.removeCacheEntity(entity);
    })
  );

  return Array.from(all_entities);
};
