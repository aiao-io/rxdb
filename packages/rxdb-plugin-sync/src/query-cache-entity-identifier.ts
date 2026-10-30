/**
 * @packageDocumentation
 * QueryCache 适配器契约里的实体标识。
 */

/**
 * QueryCache 适配器契约里的实体标识：`public` 命名空间写裸实体名，其余命名空间写成 `namespace:entity`。
 *
 * @param namespace - 实体命名空间（`EntityMetadata.namespace`）
 * @param entity - 实体名（`EntityMetadata.name`）
 * @returns 交给 `QueryCacheRemoteAdapter` / `QueryCacheLocalAdapter` 各方法的 `entityName`
 *
 * @remarks
 * 在线读写（`@aiao/rxdb-plugin-querycache` 的主仓储）与离线重放（本包的 `flushQueryCacheOutbox`）必须用同一个标识：
 * 各适配器按它定位远端资源与本地缓存表（HTTP 的 `resources` 映射按传入名查，SQLite / PGlite / Supabase 按
 * `namespace:entity` 解析）。两边各拼一份，非 public 实体的离线写迟早会被送到同名的公共实体上 ——
 * 写进了别人的资源，调用却算成功、水位照推。
 *
 * 放在本包而不是读引擎包：读引擎包已经依赖本包（出站队列由本包提供），反过来引用会成环。
 *
 * @example
 * ```ts
 * queryCacheEntityIdentifier('public', 'Todo'); // 'Todo'
 * queryCacheEntityIdentifier('tenant_a', 'Todo'); // 'tenant_a:Todo'
 * ```
 */
export function queryCacheEntityIdentifier(namespace: string, entity: string): string {
  return namespace === 'public' ? entity : `${namespace}:${entity}`;
}
