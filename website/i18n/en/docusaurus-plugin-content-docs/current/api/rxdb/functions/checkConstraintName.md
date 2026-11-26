# checkConstraintName()

```ts
function checkConstraintName(metadata, check): string;
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:450](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L450)

Generates a deterministic constraint name: `ck_<table name>_<author name>_<8-char hash of the normalized expression>`.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) |
| `check` | [`EntityCheckMetadataOptions`](../interfaces/EntityCheckMetadataOptions.md) |

## Returns

`string`

## Throws

[RxDBError](../classes/RxDBError.md) when the author `name` does not match `[a-z][a-z0-9_]*`, or the full name exceeds 63 UTF-8 bytes (AC#15)
