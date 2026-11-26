# SwitchDisableCallback

```ts
type SwitchDisableCallback = (args) => boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:147

Callback deciding the disabled state of a switch

## Parameters

| Parameter | Type                       | Description                                                     |
| --------- | -------------------------- | --------------------------------------------------------------- |
| `args`    | `StylePropertyFunctionArg` | VTable callback parameters (used to get the current row record) |

## Returns

`boolean`

true means the switch is disabled
