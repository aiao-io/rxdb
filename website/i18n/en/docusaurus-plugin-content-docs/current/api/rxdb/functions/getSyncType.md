# getSyncType()

```ts
function getSyncType(metadata, globalSync?): RepositorySyncType;
```

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L84)

Gets the sync type from EntityMetadata.

## Parameters

| Parameter     | Type                                                                                                              | Description                                                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `metadata`    | [`EntityMetadata`](../type-aliases/EntityMetadata.md)                                                             | The entity metadata                                                                                                                                                   |
| `globalSync?` | \| [`SyncOptions`](../type-aliases/SyncOptions.md) \| [`EntitySyncResolver`](../interfaces/EntitySyncResolver.md) | Global sync configuration (optional, used as fallback); when an instance resolver `rxdb.entitySync` is passed, instance-level overrides are resolved together with it |

## Returns

[`RepositorySyncType`](../type-aliases/RepositorySyncType.md)

The sync type

## Example

```ts
// Full sync (bidirectional)
const metadata = {
  sync: {
    type: SyncType.Full,
    local: { adapter: 'sqlite' },
    remote: `{ adapter: 'supabase' }`
  }
};
getSyncType(metadata); // 'full'

// Remote only (read-only remote)
const metadata = {
  sync: {
    type: SyncType.None,
    remote: `{ adapter: 'supabase' }`
  }
};
getSyncType(metadata); // 'remote'

// Local only
const metadata = {
  sync: {
    type: SyncType.None,
    local: `{ adapter: 'sqlite' }`
  }
};
getSyncType(metadata); // 'local'

// No sync (system tables)
const metadata = { sync: undefined };
getSyncType(metadata); // 'none'

// Using the global configuration as fallback
const metadata = { sync: undefined };
const globalSync = { type: SyncType.Full, local: {...}, remote: {...} };
getSyncType(metadata, globalSync); // 'full'
```
