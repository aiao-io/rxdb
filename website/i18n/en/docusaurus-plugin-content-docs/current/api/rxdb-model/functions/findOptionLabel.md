# findOptionLabel()

```ts
function findOptionLabel(options, selected, placeholder): string;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/popover-position.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/popover-position.ts#L57)

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
