# getCellRecord

```ts
const getCellRecord: (args) => ColumnRecord | undefined;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:140

Safely gets the current row record from VTable callback arguments

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `args` | `StylePropertyFunctionArg` | VTable callback arguments |

## Returns

`ColumnRecord` \| `undefined`

The current row record; undefined when it cannot be obtained
