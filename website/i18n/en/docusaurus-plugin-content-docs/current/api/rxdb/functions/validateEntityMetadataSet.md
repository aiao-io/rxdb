# validateEntityMetadataSet()

```ts
function validateEntityMetadataSet(
  metadataList,
  databaseSync?,
  isSyncTypeUnsupported?
): readonly EntityMetadataValidationError[];
```

Defined in: [packages/rxdb/src/entity/metadata-validate.ts:813](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata-validate.ts#L813)

Cross-entity aggregate validation; returns all violations at once, sorted.

## Parameters

| Parameter                | Type                                                                                                              | Description                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `metadataList`           | readonly `Readonly`&lt;[`EntityMetadataType`](../interfaces/EntityMetadataType.md)&gt;[]                          | The set of entity metadata to validate                                                                           |
| `databaseSync?`          | \| [`SyncOptions`](../type-aliases/SyncOptions.md) \| [`EntitySyncResolver`](../interfaces/EntitySyncResolver.md) | The database-level `rxdb.config.sync`, or the instance resolver `rxdb.entitySync` (including instance overrides) |
| `isSyncTypeUnsupported?` | `SyncTypeRestrictionLookup`                                                                                       | The repository-level sync strategy restriction lookup, see SyncTypeRestrictionLookup                             |

## Returns

readonly [`EntityMetadataValidationError`](../interfaces/EntityMetadataValidationError.md)[]
