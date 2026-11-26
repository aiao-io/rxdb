# isRecord()

```ts
function isRecord(value): value is UnknownRecord;
```

Defined in: [preferences/merge.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/preferences/merge.ts#L32)

Checks whether a value is a plain object.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `unknown` | Any value. |

## Returns

`value is UnknownRecord`

Whether it is a plain object (non-null, non-array).
