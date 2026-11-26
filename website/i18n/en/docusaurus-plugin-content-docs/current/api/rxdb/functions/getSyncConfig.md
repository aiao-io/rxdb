# getSyncConfig()

```ts
function getSyncConfig(metadata, globalSync?): SyncOptions | undefined;
```

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L30)

Gets the effective sync configuration of an entity (with global configuration fallback support).

## Parameters

| Parameter     | Type                                                                                                              | Description                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `metadata`    | [`EntityMetadata`](../type-aliases/EntityMetadata.md)                                                             | The entity metadata                                                                                                                  |
| `globalSync?` | \| [`SyncOptions`](../type-aliases/SyncOptions.md) \| [`EntitySyncResolver`](../interfaces/EntitySyncResolver.md) | Global sync configuration (optional); when an instance resolver `rxdb.entitySync` is passed, instance overrides are resolved as well |

## Returns

[`SyncOptions`](../type-aliases/SyncOptions.md) \| `undefined`

The effective sync configuration of the entity; returns undefined when there is no configuration at all.
