# storageConstraintName()

```ts
function storageConstraintName(
   prefix, 
   metadata, 
   name, 
   definition, 
   kind
): string;
```

Defined in: [packages/rxdb/src/entity/constraint-name.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/constraint-name.ts#L50)

Generates a deterministic constraint name: `<prefix><table name>_<author name>_<8-char hash of the normalized definition>`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `prefix` | `string` | `ck_` / `uq_` / `ex_` |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | The metadata of the entity the constraint belongs to |
| `name` | `string` | The constraint name given by the author |
| `definition` | `string` | The normalized definition (hash input) |
| `kind` | `string` | The constraint kind in error messages, such as `CHECK`, `conditional unique index` |

## Returns

`string`

## Throws

[RxDBError](../classes/RxDBError.md) when the author `name` does not match `[a-z][a-z0-9_]*`, the table name contains characters other than letters / digits / underscores,
  or the full name exceeds 63 UTF-8 bytes (AC#15)
