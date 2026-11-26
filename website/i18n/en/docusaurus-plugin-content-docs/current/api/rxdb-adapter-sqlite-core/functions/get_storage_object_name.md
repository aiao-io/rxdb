# get_storage_object_name()

```ts
function get_storage_object_name(
   constraintName, 
   metadata, 
   tableSet
): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/table-name-resolver.ts#L156)

The object name of database-level constraint objects (conditional unique indexes, interval exclusion constraints) within a given table set.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `constraintName` | `string` | The deterministic constraint name given by the core (`storageConstraintName`) |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | The metadata of the entity the constraint belongs to |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | The table set |

## Returns

`string`

As-is for the main table set or when there is no replica; otherwise replaces the trailing definition hash

## Remarks

Only the hash is replaced, no suffix is added: constraint names are already generated right up against the 63-byte limit, and adding a suffix would push a legal name over the limit.
The trigger names of interval exclusion are derived from this result by `exclusionTriggerNames`.
