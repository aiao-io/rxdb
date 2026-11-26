# getRxDBChangeEntityIdQueryValues()

```ts
function getRxDBChangeEntityIdQueryValues(ids): string[];
```

Defined in: [packages/rxdb/src/system/change-codec.ts:370](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change-codec.ts#L370)

Splits a set of IDs into a string set usable in a SQL `IN (...)` list.

String IDs are placed in both the raw value and the prefixed encoded form — the column may hold either one (historical data has only the raw value, new writes use the encoded form), and the IN list must be compatible with both, otherwise records in the new format would be missed.

## Parameters

| Parameter | Type                                                         |
| --------- | ------------------------------------------------------------ |
| `ids`     | readonly [`RxDBEntityId`](../type-aliases/RxDBEntityId.md)[] |

## Returns

`string`[]
