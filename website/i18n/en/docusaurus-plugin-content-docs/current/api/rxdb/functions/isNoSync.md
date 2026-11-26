# isNoSync()

```ts
function isNoSync(metadata, globalSync?): boolean;
```

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:331](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L331)

Checks whether a repository does not sync at all.

## Parameters

| Parameter     | Type                                                                                                              | Description                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `metadata`    | [`EntityMetadata`](../type-aliases/EntityMetadata.md)                                                             | The entity metadata                                                                                                                                 |
| `globalSync?` | \| [`SyncOptions`](../type-aliases/SyncOptions.md) \| [`EntitySyncResolver`](../interfaces/EntitySyncResolver.md) | Global sync configuration (optional); when an instance resolver `rxdb.entitySync` is passed, instance-level overrides are resolved together with it |

## Returns

`boolean`

Whether it does not sync

## Example

```ts
isNoSync(metadataFull); // false
isNoSync(metadataRemote); // false
isNoSync(metadataLocal); // false
isNoSync(metadataNone); // true (system tables)
```
