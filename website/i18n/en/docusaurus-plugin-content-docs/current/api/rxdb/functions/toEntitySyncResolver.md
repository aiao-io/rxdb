# toEntitySyncResolver()

```ts
function toEntitySyncResolver(source): EntitySyncResolver;
```

Defined in: [packages/rxdb/src/sync-contract/entity-sync-resolver.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/entity-sync-resolver.ts#L123)

Normalizes the legacy `databaseSync` parameter into a resolver.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `source` | \| [`SyncOptions`](../type-aliases/SyncOptions.md) \| [`EntitySyncResolver`](../interfaces/EntitySyncResolver.md) \| `undefined` | A resolver, or the database-level `sync` passed by old call sites |

## Returns

[`EntitySyncResolver`](../interfaces/EntitySyncResolver.md)

The resolver; when a `SyncOptions` is passed, constructs a resolver with no instance overrides

## Remarks

Public functions (`validateEntityMetadata`, `buildPushableRepositoryRules`, etc.) previously accepted
`databaseSync: SyncOptions`. The parameter type is widened to either one; old calls compile as before with behavior unchanged character for character;
new calls pass `rxdb.entitySync` to use instance overrides.
