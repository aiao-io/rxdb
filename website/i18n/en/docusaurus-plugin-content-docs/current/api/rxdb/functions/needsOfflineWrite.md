# needsOfflineWrite()

```ts
function needsOfflineWrite(metadata, globalSync?): boolean;
```

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:312](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L312)

Checks whether a repository accepts local writes while the remote is unreachable (and replays them after the connection recovers).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | The entity metadata |
| `globalSync?` | \| [`SyncOptions`](../type-aliases/SyncOptions.md) \| [`EntitySyncResolver`](../interfaces/EntitySyncResolver.md) | Global sync configuration (optional); when an instance resolver `rxdb.entitySync` is passed, instance-level overrides are resolved together with it |

## Returns

`boolean`

Whether offline writes are supported

## Example

```ts
needsOfflineWrite(metadataFull);       // true
needsOfflineWrite(metadataQueryCache); // true  (replayed through REST verbs, not via changelog)
needsOfflineWrite(metadataRemote);     // false (no local storage, nowhere to write)
needsOfflineWrite(metadataLocal);      // false (no remote, nowhere to replay)
needsOfflineWrite(metadataNone);       // false
```

## Remarks

Orthogonal to [needsPush](needsPush.md) — do not substitute one for the other: `querycache` is
`true` here and `false` in `needsPush`. The push driver dispatches on these two fields —
`push` goes through `syncManager.push()`, while `offlineWrite && !push` goes through QueryCache outbound replay.
