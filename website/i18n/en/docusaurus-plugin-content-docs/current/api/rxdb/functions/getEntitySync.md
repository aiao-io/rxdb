# getEntitySync()

```ts
function getEntitySync(EntityType, source): SyncOptions | undefined;
```

Defined in: [packages/rxdb/src/entity/primary-adapter.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/primary-adapter.ts#L66)

Gets the sync configuration in effect for an entity.

## Parameters

| Parameter    | Type                                                                                                                             | Description                                                                                                                                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EntityType` | [`EntityType`](../type-aliases/EntityType.md)                                                                                    | The entity class                                                                                                                                                                                                                                       |
| `source`     | \| [`SyncOptions`](../type-aliases/SyncOptions.md) \| [`EntitySyncResolver`](../interfaces/EntitySyncResolver.md) \| `undefined` | The instance resolver `rxdb.entitySync` (including instance overrides); when the database-level `sync` is passed, resolution follows "entity metadata takes precedence over database-level configuration" only, and no instance override is recognized |

## Returns

[`SyncOptions`](../type-aliases/SyncOptions.md) \| `undefined`
