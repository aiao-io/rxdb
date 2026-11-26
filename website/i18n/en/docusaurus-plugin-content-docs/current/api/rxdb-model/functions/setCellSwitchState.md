# setCellSwitchState()

```ts
function setCellSwitchState(table, col, row, value): void;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/vtable-compat.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/vtable-compat.ts#L27)

Sets the visual state of a switch/checkbox/radio cell

## Parameters

| Parameter | Type           | Description           |
| --------- | -------------- | --------------------- |
| `table`   | `ListTableAll` | Target table instance |
| `col`     | `number`       | Column index          |
| `row`     | `number`       | Row index             |
| `value`   | `boolean`      | Target boolean state  |

## Returns

`void`
