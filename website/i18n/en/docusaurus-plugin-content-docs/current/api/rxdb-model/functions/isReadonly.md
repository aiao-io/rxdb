# isReadonly()

```ts
function isReadonly(record): boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:577](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L577)

Checks whether the record is a read-only row.

## Parameters

| Parameter | Type      | Description             |
| --------- | --------- | ----------------------- |
| `record`  | `unknown` | The row record to check |

## Returns

`boolean`

Whether it is a read-only row
