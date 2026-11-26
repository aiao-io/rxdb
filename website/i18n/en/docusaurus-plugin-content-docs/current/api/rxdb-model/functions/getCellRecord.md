# getCellRecord()

```ts
function getCellRecord(args): ColumnRecord | undefined;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:558](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L558)

Safely gets the current row record from VTable callback arguments.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `args` | `StylePropertyFunctionArg` | The VTable callback arguments |

## Returns

`ColumnRecord` \| `undefined`

The current row record; returns undefined when it cannot be obtained
