# compileCheckConstraint()

```ts
function compileCheckConstraint(metadata, check): CompiledCheckConstraint;
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:468](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L468)

Compiles an entity-level CHECK.

## Parameters

| Parameter  | Type                                                                        |
| ---------- | --------------------------------------------------------------------------- |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md)                       |
| `check`    | [`EntityCheckMetadataOptions`](../interfaces/EntityCheckMetadataOptions.md) |

## Returns

[`CompiledCheckConstraint`](../interfaces/CompiledCheckConstraint.md)

The constraint name and normalized expression; shared by the table-creation DDL of both backends and the drift comparison.
