# toCheckViolationErrorForRows()

```ts
function toCheckViolationErrorForRows(
   cause, 
   metadata, 
   rows
): unknown;
```

Defined in: [packages/rxdb/src/system/check-violation.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/check-violation.ts#L93)

CHECK violation normalization for multi-row batch writes: conflicting values are listed side by side per row (the native message for a batch INSERT does not say which row was hit, so the values of all candidate rows are listed).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `cause` | `unknown` |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) |
| `rows` | readonly `Readonly`&lt;`Record`&lt;`string`, `unknown`&gt;&gt;[] |

## Returns

`unknown`
