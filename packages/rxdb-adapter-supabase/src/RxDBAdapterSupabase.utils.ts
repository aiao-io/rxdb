import { EntityType, getEntityMetadata, type EntityMetadata } from '@aiao/rxdb';
import { SupabaseConfigError } from './errors.js';

/**
 * 断言实体的主键物理列就是默认的 `id`，批量写入口在发出任何请求前调用。
 *
 * @param metadata - 实体元数据
 * @param operation - 批量写入口名，进错误信息
 * @throws {SupabaseConfigError} 主键 `id` 声明了别的 columnName
 *
 * @remarks
 * 批量直写（`saveMany` / `mutations`）与单实体 CRUD 写的是同一张业务表，后者按 columnName 解析主键；
 * 前者的载荷却以 `id` 键定位行：`saveMany` 展开实体交给 PostgREST upsert，`mutations` 交给
 * `ON CONFLICT (id)`、按 `id` 取实体键与列类型的 `rxdb_mutations` 一族。自定义主键列照常下发的结局是
 * PostgREST 报列不存在，或在服务端写到一半才失败，所以在发请求前就拒绝。
 *
 * 同步推送 `mergeChanges` 不调用本断言：同步协议两端（变更日志触发器 `NEW.id`、`rxdb_mutations`）都绑定
 * 业务表的 `id` 列、从不读实体主键的 columnName，只在本地改了主键列名的同步实体本来就能推送。
 */
export function assert_batch_primary_key_column(metadata: EntityMetadata, operation: string): void {
  const columnName = metadata.propertyMap.get('id')?.columnName ?? 'id';
  if (columnName === 'id') return;
  throw new SupabaseConfigError(
    `${operation} does not support ${metadata.namespace}:${metadata.name}: its primary key "id" maps to column "${columnName}", ` +
      'but Supabase batch writes (saveMany / mutations) require the primary key column "id"'
  );
}

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
 * @param userId - 当前用户；不传则不注入审计字段
 * @param mode - 写入语义，默认 `'insert'`。`'update'` 下无论有没有 `userId` 都**不下发** `createdBy`，避免覆写原作者
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
      data: data.map(e => applyAuditFields(e, userId, mode))
    });
  }

  return params;
}

/**
 * 按写入语义处理审计字段。
 *
 * @param entity - 待写入实体
 * @param userId - 当前用户；不传则不注入 `createdBy` / `updatedBy`
 * @param mode - `'insert'` 注入 `createdBy` + `updatedBy`；`'update'` 只注入 `updatedBy`，且无论有没有 `userId` 都**移除** `createdBy`
 * @returns 可直接下发给 `rxdb_mutations` 的行数据
 *
 * @remarks
 * 修改走普通 UPDATE，`SET` 覆盖载荷里出现的每一列。更新路径只要把 `createdBy` 送上去，原作者就会被
 * 覆写（有身份时成了当前用户，没身份时成了实体手里的值，可能是 `null`）—— 若 RLS 依赖该列判定行归属，
 * 这等于一次静默的所有权转移。因此更新语义下必须**根本不下发**该列，让服务端的 SET 子句碰不到它。
 *
 * `createdBy` 是只读系统字段：`SupabaseRepository.update` 按只读过滤从不下发它，
 * `mergeChanges` 的修改也只注 `updatedBy`，此处与两者对齐。
 */
const applyAuditFields = <T extends object>(
  entity: T,
  userId: string | undefined,
  mode: UpsertMode
): Record<string, unknown> => {
  const row = { ...entity } as Record<string, unknown>;
  if (userId) row['updatedBy'] = userId;
  if (mode === 'update') {
    delete row['createdBy'];
  } else if (userId) {
    row['createdBy'] = userId;
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
