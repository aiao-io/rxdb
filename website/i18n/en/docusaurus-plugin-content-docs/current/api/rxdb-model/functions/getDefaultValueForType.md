# getDefaultValueForType()

```ts
function getDefaultValueForType(type): unknown;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/value-input.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/value-input.ts#L65)

Returns the default value for the given input control type.

## Parameters

| Parameter | Type     | Description                                             |
| --------- | -------- | ------------------------------------------------------- |
| `type`    | `string` | The input control type (a return value of getInputType) |

## Returns

`unknown`

The default value for the type: false for boolean, [] for range/array/enum-array, undefined for subquery, null for none/number/date, and '' for the rest.
