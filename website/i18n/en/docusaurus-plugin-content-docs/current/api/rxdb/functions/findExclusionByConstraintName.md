# findExclusionByConstraintName()

```ts
function findExclusionByConstraintName(metadata, constraintName): CompiledExclusionConstraint | undefined;
```

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:288](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L288)

Looks up the exclusion range declared in the entity metadata by constraint name (used for violation normalization).

## Parameters

| Parameter        | Type                                                  |
| ---------------- | ----------------------------------------------------- |
| `metadata`       | [`EntityMetadata`](../type-aliases/EntityMetadata.md) |
| `constraintName` | `string`                                              |

## Returns

\| [`CompiledExclusionConstraint`](../interfaces/CompiledExclusionConstraint.md)
\| `undefined`

The compiled result whose constraint name matches; `undefined` when it was never declared (or failed to compile)
