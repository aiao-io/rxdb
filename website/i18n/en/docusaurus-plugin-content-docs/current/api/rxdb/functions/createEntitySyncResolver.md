# createEntitySyncResolver()

```ts
function createEntitySyncResolver(databaseSync, overrides?): EntitySyncResolver;
```

Defined in: [packages/rxdb/src/sync-contract/entity-sync-resolver.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/entity-sync-resolver.ts#L79)

Constructs an entity sync configuration resolver.

## Parameters

| Parameter      | Type                                                                                                                                                | Description                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `databaseSync` | [`SyncOptions`](../type-aliases/SyncOptions.md) \| `undefined`                                                                                      | The database-level default `sync`                                                                                       |
| `overrides?`   | `ReadonlyMap`&lt;`Readonly`&lt;[`EntityMetadataType`](../interfaces/EntityMetadataType.md)&gt;, [`SyncOptions`](../type-aliases/SyncOptions.md)&gt; | Instance-level overrides keyed by entity metadata; internally looked up by `namespace:name`, omitted means no overrides |

## Returns

[`EntitySyncResolver`](../interfaces/EntitySyncResolver.md)

The resolver.

## Example

```ts
const resolver = createEntitySyncResolver(rxdb.config.sync);
resolver.resolveType(Todo); // 'full'
```
