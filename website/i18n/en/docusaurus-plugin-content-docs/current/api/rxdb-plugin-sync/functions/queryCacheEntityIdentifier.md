# queryCacheEntityIdentifier()

```ts
function queryCacheEntityIdentifier(namespace, entity): string;
```

Defined in: [packages/rxdb-plugin-sync/src/query-cache-entity-identifier.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/query-cache-entity-identifier.ts#L28)

The entity identifier in the QueryCache adapter contract: the `public` namespace
is written as the bare entity name, and other namespaces as `namespace:entity`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `namespace` | `string` | The entity namespace (`EntityMetadata.namespace`) |
| `entity` | `string` | The entity name (`EntityMetadata.name`) |

## Returns

`string`

The `entityName` handed to each method of `QueryCacheRemoteAdapter` / `QueryCacheLocalAdapter`

## Remarks

Online read/write (`@aiao/rxdb-plugin-querycache`'s main repository) and offline
replay (this package's `flushQueryCacheOutbox`) must use the same identifier:
each adapter locates remote resources and local cache tables by it. HTTP's
`resources` map looks up by the passed name; SQLite / PGlite / Supabase treat a
bare name as `public` and resolve `namespace:entity` by the written namespace,
so a bare name is unambiguous even when `public` and another namespace share a
name. If each side composed its own, offline writes of non-public entities
would eventually be sent to same-named public entities — written into someone
else's resource while the call counts as success and the waterline advances.

Lives in this package rather than the read engine package: the read engine
package already depends on this package (the outbound queue is provided here),
and a reverse reference would form a cycle.

## Example

```ts
queryCacheEntityIdentifier('public', 'Todo'); // 'Todo'
queryCacheEntityIdentifier('tenant_a', 'Todo'); // 'tenant_a:Todo'
```
