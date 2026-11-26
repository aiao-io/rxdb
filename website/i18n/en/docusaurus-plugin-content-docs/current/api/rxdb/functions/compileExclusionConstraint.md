# compileExclusionConstraint()

```ts
function compileExclusionConstraint(metadata, exclusion): CompiledExclusionConstraint;
```

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:247](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L247)

Compiles an exclusion range declaration.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | The entity metadata produced by `transitionMetadata()` |
| `exclusion` | [`EntityExclusionMetadataOptions`](../interfaces/EntityExclusionMetadataOptions.md) | The exclusion range declaration |

## Returns

[`CompiledExclusionConstraint`](../interfaces/CompiledExclusionConstraint.md)

The deterministic constraint name, equality columns and range dimensions

## Throws

[RxDBError](../classes/RxDBError.md) when the equality columns / range dimensions are empty, a column does not exist or has a mismatched type, `bounds` is invalid,
  the same column appears twice, `name` does not match `[a-z][a-z0-9_]*` or the full name exceeds 63 bytes (AC#15)
