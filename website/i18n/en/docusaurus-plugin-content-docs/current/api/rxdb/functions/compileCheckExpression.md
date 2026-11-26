# compileCheckExpression()

```ts
function compileCheckExpression(metadata, check): string;
```

Defined in: [packages/rxdb/src/entity/check-constraint.ts:442](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/check-constraint.ts#L442)

Compiles an entity-level CHECK into a normalized SQL expression (without the `CHECK (...)` wrapper).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | The entity metadata produced by `transitionMetadata()` |
| `check` | [`EntityCheckMetadataOptions`](../interfaces/EntityCheckMetadataOptions.md) | The entity-level CHECK declaration |

## Returns

`string`

The normalized expression: column names double-quote delimited, literals compiled per column type, one statement for both backends

## Throws

[RxDBError](../classes/RxDBError.md) for operators outside the whitelist, relation paths, JSON / key-value / binary / encrypted columns,
  literals out of the value domain, etc.; the message names the constraint and the reason (AC#9 / AC#15)
