# findOptionLabel()

```ts
function findOptionLabel(options, selected, placeholder): string;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/popover-position.d.ts:32

Finds the label of the matching item in the popover option list.

## Parameters

| Parameter     | Type                | Description                                                              |
| ------------- | ------------------- | ------------------------------------------------------------------------ |
| `options`     | readonly `object`[] | The option list (value is the selected value, label is the display text) |
| `selected`    | `string`            | The currently selected value                                             |
| `placeholder` | `string`            | The placeholder text returned when no match is found                     |

## Returns

`string`

The matching item's label; returns placeholder when not found
