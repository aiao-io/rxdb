# SwitchDisableCallback

```ts
type SwitchDisableCallback = (args) => boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:147

Callback that decides the disabled state of a switch

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `args` | `StylePropertyFunctionArg` | VTable callback arguments (used to get the current row record) |

## Returns

`boolean`

true means the switch is disabled
