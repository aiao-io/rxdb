# isFloat()

```ts
function isFloat(value): value is number;
```

Defined in: [packages/utils/src/types/isFloat.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/types/isFloat.ts#L10)

Checks whether a value is a float (finite and with a fractional part).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `unknown` |

## Returns

`value is number`

## Remarks

`Number.isFinite` is required: `Infinity % 1` evaluates to `NaN`, and `NaN !== 0` is true, so `±Infinity` would be classified as a float (UTL-029).
