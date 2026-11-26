# needsPull()

```ts
function needsPull(metadata, globalSync?): boolean;
```

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:260](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L260)

Checks whether a repository needs pull.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | The entity metadata |
| `globalSync?` | \| [`SyncOptions`](../type-aliases/SyncOptions.md) \| [`EntitySyncResolver`](../interfaces/EntitySyncResolver.md) | Global sync configuration (optional); when an instance resolver `rxdb.entitySync` is passed, instance-level overrides are resolved together with it |

## Returns

`boolean`

Whether pull is needed

## Remarks

Only looks at the capabilities of `syncType`, **not `RxDBSync.enabled`** — this is a reporting-side predicate.
"How much can be pulled" and "whether pulling is currently allowed" are two different things; the latter is
guarded by `pullIneligibility` at the scheduling entry point.

## Example

```ts
needsPull(metadataFull);       // true  (full)
needsPull(metadataFilter);     // true  (filter)
needsPull(metadataQueryCache); // true  (querycache — batch pull keeps pulling it)
needsPull(metadataRemote);     // true  (remote)
needsPull(metadataLocal);      // false (local)
needsPull(metadataNone);       // false (none)
```
