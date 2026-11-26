# setCellSwitchState()

```ts
function setCellSwitchState(
   table, 
   col, 
   row, 
   value
): void;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/vtable-compat.d.ts:22

Sets the visual state of a switch/checkbox/radio cell

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `ListTableAll` | The target table instance |
| `col` | `number` | Column index |
| `row` | `number` | Row index |
| `value` | `boolean` | The target boolean state |

## Returns

`void`
