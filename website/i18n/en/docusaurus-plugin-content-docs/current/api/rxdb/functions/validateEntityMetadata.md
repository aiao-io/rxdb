# validateEntityMetadata()

```ts
function validateEntityMetadata(
   metadata, 
   databaseSync?, 
   isSyncTypeUnsupported?
): readonly EntityMetadataValidationError[];
```

Defined in: [packages/rxdb/src/entity/metadata-validate.ts:776](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata-validate.ts#L776)

Validates a single entity's metadata declaration; returns all violations sorted by `namespace/entity/field/rule`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | The entity metadata produced by `transitionMetadata()` |
| `databaseSync?` | \| [`SyncOptions`](../type-aliases/SyncOptions.md) \| [`EntitySyncResolver`](../interfaces/EntitySyncResolver.md) | The database-level `rxdb.config.sync`; it takes effect when the entity does not declare `sync`. You may also pass the instance resolver `rxdb.entitySync`, in which case validation runs against the effective configuration including instance overrides. Omit to look only at the entity's own declaration |
| `isSyncTypeUnsupported?` | `SyncTypeRestrictionLookup` | The repository-level sync strategy restriction lookup, see SyncTypeRestrictionLookup. Omit when the core knows no repository restrictions |

## Returns

readonly [`EntityMetadataValidationError`](../interfaces/EntityMetadataValidationError.md)[]

The sorted list of violations; an empty array when there are none

## Remarks

Pure function: does not throw, does not modify inputs, does not access global state. Malformed inputs (`format: null`, a non-array `enum`, etc.)
are always converted into violation entries rather than runtime crashes. Cross-entity aggregation and throwing are the job of `EntityManager.init()`.

## Example

```typescript
const errors = validateEntityMetadata(getEntityMetadata(User));
if (errors.length > 0) throw new RxDBError(errors.map(e => e.message).join('\n'));
```
