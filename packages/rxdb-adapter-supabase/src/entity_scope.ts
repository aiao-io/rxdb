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
 * 将上游仅含实体名的标识解析为唯一作用域。
 *
 * 显式的 `namespace:entity` 可直接定位；裸实体名只有在配置中唯一时才允许使用。
 */
export function resolveEntityScope(rxdb: RxDB, identifier: string): EntityScope {
  const scopes = getConfiguredEntityScopes(rxdb);
  const separatorIndex = identifier.indexOf(':');
  const matches =
    separatorIndex > 0 ?
      scopes.filter(
        scope =>
          scope.namespace === identifier.slice(0, separatorIndex) &&
          scope.entity === identifier.slice(separatorIndex + 1)
      )
    : scopes.filter(scope => scope.entity === identifier);

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    throw new SupabaseConfigError(`Entity "${identifier}" is configured in multiple namespaces`);
  }

  throw new SupabaseConfigError(`Entity "${identifier}" is not configured`);
}

/** 判断逻辑 namespace + entity 是否属于当前配置。 */
export function isConfiguredEntityScope(rxdb: RxDB, namespace: string | undefined, entity: string): boolean {
  const logicalNamespace = namespace || 'public';
  return getConfiguredEntityScopes(rxdb).some(scope => scope.namespace === logicalNamespace && scope.entity === entity);
}
