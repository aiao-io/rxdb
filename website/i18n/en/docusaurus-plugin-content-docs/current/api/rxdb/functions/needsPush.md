# needsPush()

```ts
function needsPush(metadata, globalSync?): boolean;
```

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:287](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L287)

Checks whether a repository needs push.

## Parameters

| Parameter     | Type                                                                                                              | Description                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `metadata`    | [`EntityMetadata`](../type-aliases/EntityMetadata.md)                                                             | The entity metadata                                                                                                                                 |
| `globalSync?` | \| [`SyncOptions`](../type-aliases/SyncOptions.md) \| [`EntitySyncResolver`](../interfaces/EntitySyncResolver.md) | Global sync configuration (optional); when an instance resolver `rxdb.entitySync` is passed, instance-level overrides are resolved together with it |

## Returns

`boolean`

Whether push is needed

## Example

```ts
needsPush(metadataFull); // true  (full)
needsPush(metadataFilter); // true  (filter - local changes are not limited by the filter)
needsPush(metadataRemote); // false (remote)
needsPush(metadataLocal); // false (local — local only, does not sync with the remote)
needsPush(metadataNone); // false (none)
```

## Remarks

`'local'` always returns `false`: its definition is "`SyncType.None` + only a local adapter configured, no remote",
and the public contract says "local only". Previously returning `true` would put private local data into the push queue (leaking it outward),
and such repositories have no remote adapter at all — the push could never execute anyway.

Like [needsPull](needsPull.md), only looks at `syncType`, not `RxDBSync.enabled`.
