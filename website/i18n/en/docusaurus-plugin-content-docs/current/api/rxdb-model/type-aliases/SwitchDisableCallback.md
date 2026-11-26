# SwitchDisableCallback

```ts
type SwitchDisableCallback = (args) => boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:569](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L569)

Switch disabled state predicate callback

## Parameters

| Parameter | Type                       | Description                                                      |
| --------- | -------------------------- | ---------------------------------------------------------------- |
| `args`    | `StylePropertyFunctionArg` | VTable callback argument (used to obtain the current row record) |

## Returns

`boolean`

true means the switch is disabled
