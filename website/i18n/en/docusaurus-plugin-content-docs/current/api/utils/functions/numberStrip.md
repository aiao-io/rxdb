# numberStrip()

```ts
function numberStrip(value, precision?): number;
```

Defined in: [packages/utils/src/number/numberStrip.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/number/numberStrip.ts#L21)

Strips useless decimal places from a number, solving floating-point precision issues
Limits significant digits to remove the tiny errors produced by JavaScript floating-point arithmetic
e.g. 0.1 + 0.2 usually yields 0.30000000000000004, while this function yields 0.3

## Parameters

| Parameter    | Type     | Default value | Description                                               |
| ------------ | -------- | ------------- | --------------------------------------------------------- |
| `value`      | `number` | `undefined`   | The number to process                                     |
| `precision?` | `number` | `12`          | Number of significant digits; defaults to 12 (range 1-21) |

## Returns

`number`

The processed number with useless decimal places removed

## Examples

```ts
numberStrip(0.1 + 0.2); // returns 0.3 (solves the floating-point precision issue)
```

```ts
numberStrip(1.2345); // returns 1.2345 (12 significant digits by default)
```

```ts
numberStrip(12345.6789, 6); // returns 12345.7 (6 significant digits)
```

```ts
numberStrip(0.0000012345);     // returns 0.0000012345
**Note:** the significant-digit count (precision) controls overall numeric precision, not just the fractional part
**Note:** the default precision of 12 fits most scenarios; adjust as needed, but never exceed 21
**Note:** implemented with Number.toPrecision(), then converted back to a number via parseFloat()
```
