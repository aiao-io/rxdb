# isEntitySyncResolver()

```ts
function isEntitySyncResolver(source): source is EntitySyncResolver;
```

Defined in: [packages/rxdb/src/sync-contract/entity-sync-resolver.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/entity-sync-resolver.ts#L103)

Judges whether the argument is a resolver (rather than a database-level `SyncOptions`).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | \| [`SyncOptions`](../type-aliases/SyncOptions.md) \| [`EntitySyncResolver`](../interfaces/EntitySyncResolver.md) \| `undefined` | The resolver or the database-level configuration |

## Returns

`source is EntitySyncResolver`
