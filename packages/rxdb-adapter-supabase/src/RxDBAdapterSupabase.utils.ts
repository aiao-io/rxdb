import { EntityType, getEntityMetadata } from '@aiao/rxdb';

/**
 * 按实体类型分组
 */
export function group_by_type<T extends EntityType>(
  entities: InstanceType<T>[]
): Map<EntityType, Set<InstanceType<T>>> {
  const grouped = new Map<EntityType, Set<InstanceType<T>>>();
  for (const entity of entities) {
    const type = entity.constructor as EntityType;
    if (!grouped.has(type)) {
      grouped.set(type, new Set());
    }
    grouped.get(type)!.add(entity);
  }
  return grouped;
}

/**
 * upsert 的写入语义。
 *
 * 决定审计字段怎么注入 —— 见 {@link build_upsert_params} 的 `mode` 参数。
 */
export type UpsertMode = 'insert' | 'update';

/**
 * 构建 upsert RPC 参数
 *
 * @param entityMap - 按实体类型分组的待写入实体
 * @param userId - 当前用户；不传则完全不注入审计字段
 * @param mode - 写入语义，默认 `'insert'`。`'update'` 下**不下发** `createdBy`，避免覆写原作者
 * @returns `rxdb_mutations` RPC 的 upsert 参数数组
 */
export function build_upsert_params<T extends EntityType>(
  entityMap: Map<T, Set<InstanceType<T>>>,
  userId?: string,
  mode: UpsertMode = 'insert'
): Array<{ table: string; schema: string; data: Record<string, unknown>[] }> {
  const params: Array<{ table: string; schema: string; data: Record<string, unknown>[] }> = [];

  for (const [EntityType, entities] of entityMap) {
    const metadata = getEntityMetadata(EntityType);
    const data = Array.from(entities);
    params.push({
      table: metadata.tableName,
      schema: metadata.namespace,
      data: userId ? data.map(e => applyAuditFields(e, userId, mode)) : data
    });
  }

  return params;
}

/**
 * 按写入语义注入审计字段。
 *
 * @param entity - 待写入实体
 * @param userId - 当前用户
 * @param mode - `'insert'` 注入 `createdBy` + `updatedBy`；`'update'` 只注入 `updatedBy` 并**移除** `createdBy`
 * @returns 可直接下发给 `rxdb_batch_upsert` 的行数据
 *
 * @remarks
 * 服务端 `rxdb_batch_upsert` 是 `ON CONFLICT (id) DO UPDATE SET <除 id 外全部下发的键> = EXCLUDED.<键>`。
 * 更新路径只要把 `createdBy` 送上去，原作者就会被当前用户覆写 —— 若 RLS 依赖该列判定行归属，
 * 这等于一次静默的所有权转移。因此更新语义下必须**根本不下发**该列，让服务端的 SET 子句碰不到它。
 *
 * `mergeChanges` 一直是这么做的（更新只注 `updatedBy`、插入才注 `createdBy`），此处与之对齐。
 */
const applyAuditFields = <T extends object>(entity: T, userId: string, mode: UpsertMode): Record<string, unknown> => {
  const row: Record<string, unknown> = { ...entity, updatedBy: userId };
  if (mode === 'insert') {
    row['createdBy'] = userId;
  } else {
    delete row['createdBy'];
  }
  return row;
};

/** 构建 delete RPC 参数 */
export function build_delete_params<T extends EntityType>(
  entityMap: Map<T, Set<InstanceType<T>>>
): Array<{ table: string; schema: string; ids: string[] }> {
  const params: Array<{ table: string; schema: string; ids: string[] }> = [];

  for (const [EntityType, entities] of entityMap) {
    const metadata = getEntityMetadata(EntityType);
    params.push({
      table: metadata.tableName,
      schema: metadata.namespace,
      ids: Array.from(entities).map(e => e.id)
    });
  }

  return params;
}
