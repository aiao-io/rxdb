# getSyncableRepositories()

```ts
function getSyncableRepositories(entities, globalSync?): Readonly<EntityMetadataType>[];
```

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:350](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L350)

Gets the list of repositories that need syncing.

## Parameters

| Parameter     | Type                                                                                                              | Description                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entities`    | `Readonly`&lt;[`EntityMetadataType`](../interfaces/EntityMetadataType.md)&gt;[]                                   | An array of entity metadata                                                                                                                         |
| `globalSync?` | \| [`SyncOptions`](../type-aliases/SyncOptions.md) \| [`EntitySyncResolver`](../interfaces/EntitySyncResolver.md) | Global sync configuration (optional); when an instance resolver `rxdb.entitySync` is passed, instance-level overrides are resolved together with it |

## Returns

`Readonly`&lt;[`EntityMetadataType`](../interfaces/EntityMetadataType.md)&gt;[]

The list of entities that need syncing

## Example

```ts
const entities = [todoMetadata, userMetadata, systemMetadata];
const syncable = getSyncableRepositories(entities);
// Returns: [todoMetadata, userMetadata] (excluding systemMetadata)
```
