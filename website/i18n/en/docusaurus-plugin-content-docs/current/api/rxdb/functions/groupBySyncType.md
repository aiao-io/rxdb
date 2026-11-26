# groupBySyncType()

```ts
function groupBySyncType(entities, globalSync?): Record<RepositorySyncType, EntityMetadata[]>;
```

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:376](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L376)

Groups repositories by sync type.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entities` | `Readonly`&lt;[`EntityMetadataType`](../interfaces/EntityMetadataType.md)&gt;[] | An array of entity metadata |
| `globalSync?` | \| [`SyncOptions`](../type-aliases/SyncOptions.md) \| [`EntitySyncResolver`](../interfaces/EntitySyncResolver.md) | Global sync configuration (optional); when an instance resolver `rxdb.entitySync` is passed, instance-level overrides are resolved together with it |

## Returns

`Record`&lt;[`RepositorySyncType`](../type-aliases/RepositorySyncType.md), [`EntityMetadata`](../type-aliases/EntityMetadata.md)[]&gt;

The entities grouped by sync type

## Example

```ts
const grouped = groupBySyncType(entities);
// Returns: {
//   full: [todoMetadata, commentMetadata],
//   filter: [orderMetadata],
//   remote: [userMetadata],
//   local: [draftMetadata],
//   none: [systemMetadata]
// }
```
