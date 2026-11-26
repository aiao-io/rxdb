# get_storage_object_name()

```ts
function get_storage_object_name(
   constraintName, 
   metadata, 
   tableSet
): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts#L156)

Name of a database-level constraint object (conditional unique index, range exclusion constraint) within a given table set.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `constraintName` | `string` | Deterministic constraint name from the core (`storageConstraintName`) |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Metadata of the entity the constraint lives on |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | Table set |

## Returns

`string`

Unchanged for the main table set or when there is no copy; otherwise replaces the trailing definition hash

## Remarks

Only the hash is replaced, no suffix is added: the constraint name is generated right against the 63-byte limit, and adding a suffix would overflow an otherwise legal name.
The range-exclusion trigger names are derived from this result by `exclusionTriggerNames`.
