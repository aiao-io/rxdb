# getDefaultValueForType()

```ts
function getDefaultValueForType(type): unknown;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/value-input.d.ts:21

Returns the default value for the given input control type.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `string` | The input control type (the return value of getInputType) |

## Returns

`unknown`

The default value of the corresponding type: false for boolean, [] for range/array/enum-array, undefined for subquery, null for none/number/date, and '' for the rest
