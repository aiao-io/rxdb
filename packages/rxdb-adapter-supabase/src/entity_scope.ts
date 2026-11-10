import { getEntityMetadata, type RxDB } from '@aiao/rxdb';
import { SupabaseConfigError } from './errors.js';
import { resolve_supabase_schema } from './schema.utils.js';

/** Supabase 中实体的逻辑作用域与物理表定位。 */
export interface EntityScope {
  namespace: string;
  entity: string;
  schema: string;
  tableName: string;
}

/** 返回当前 RxDB 配置中的唯一实体作用域。 */
export function getConfiguredEntityScopes(rxdb: RxDB): EntityScope[] {
  const scopes = new Map<string, EntityScope>();

  for (const EntityType of rxdb.config.entities) {
    const metadata = getEntityMetadata(EntityType);
    const namespace = metadata.namespace || 'public';
    const scope = {
      namespace,
      entity: metadata.name,
      schema: resolve_supabase_schema(namespace) ?? 'public',
      tableName: metadata.tableName
    } satisfies EntityScope;
    scopes.set(`${scope.namespace}:${scope.entity}`, scope);
  }

  return [...scopes.values()];
}

/**
 * 将上游传来的实体标识解析为作用域。
 *
 * @remarks
 * `namespace:entity` 按所写命名空间定位，**裸实体名一律按 `public` 定位**，不去别的命名空间里找唯一匹配——
 * 与 sqlite-core、PGlite 的 QueryCache 解析以及 `@aiao/rxdb-plugin-sync` 的 `queryCacheEntityIdentifier`
 * （public 写裸名）同一契约。旧实现在全部命名空间里找裸名、重名即抛：public 与别的命名空间同名时，
 * QueryCache 的读、计数与离线重放的远端探测全部报歧义（RV-01a1bb299b62）。
 * 同步插件发来的 `repositoryFilter` 与 `PullBatchRequest` 都带命名空间；`PullBatchRequest` 省略
 * `namespace` 时拼出的裸名按 public 解析，正是该接口约定的默认命名空间。
 * 以冒号开头的名字整体当裸名，不拆出一个空命名空间。
 *
 * @param rxdb - 当前 RxDB 实例
 * @param identifier - public 实体的裸名，或 `namespace:entity` 形式的限定名
 * @returns 命中的作用域
 * @throws {SupabaseConfigError} 对应命名空间下没有这个实体（含用裸名指非 public 实体）
 */
export function resolveEntityScope(rxdb: RxDB, identifier: string): EntityScope {
  const separatorIndex = identifier.indexOf(':');
  const namespace = separatorIndex > 0 ? identifier.slice(0, separatorIndex) : 'public';
  const entity = separatorIndex > 0 ? identifier.slice(separatorIndex + 1) : identifier;
  const scope = getConfiguredEntityScopes(rxdb).find(item => item.namespace === namespace && item.entity === entity);
  if (!scope) {
    throw new SupabaseConfigError(
      `Entity "${identifier}" is not configured in namespace "${namespace}"; bare names resolve to "public", write other namespaces as "namespace:entity"`
    );
  }
  return scope;
}

/** 判断逻辑 namespace + entity 是否属于当前配置。 */
export function isConfiguredEntityScope(rxdb: RxDB, namespace: string | undefined, entity: string): boolean {
  const logicalNamespace = namespace || 'public';
  return getConfiguredEntityScopes(rxdb).some(scope => scope.namespace === logicalNamespace && scope.entity === entity);
}
