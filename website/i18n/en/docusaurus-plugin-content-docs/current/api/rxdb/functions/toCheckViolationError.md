# toCheckViolationError()

```ts
function toCheckViolationError(
   cause, 
   metadata, 
   row
): unknown;
```

Defined in: [packages/rxdb/src/system/check-violation.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/check-violation.ts#L83)

Normalizes a raw CHECK violation error into an [RxDBCheckViolationError](../classes/RxDBCheckViolationError.md).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cause` | `unknown` | The raw error thrown by the adapter; returned unchanged when it is not a CHECK violation declared by this entity |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | The metadata of the entity being written |
| `row` | `Readonly`&lt;`Record`&lt;`string`, `unknown`&gt;&gt; | The row the adapter itself sent (values are read by **property name**; columns whose keys are absent are not reported) |

## Returns

`unknown`

The normalized error, or the original error

## Remarks

Native CHECK messages carry no conflicting values, so the conflicting values can only be taken from the row that was sent — every column referenced by the constraint declaration
(including `ref` targets) paired with the value in that row. Columns whose keys are **absent** from the row (incremental patches from sync replay)
are not reported, to avoid misleading `undefined` conflict values.
