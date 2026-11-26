# toInt()

```ts
function toInt(value): number;
```

Defined in: [packages/utils/src/number/toInt.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/number/toInt.ts#L22)

Converts a value to an integer, rounding down for positive numbers and up for negative numbers

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `string` \| `number` | The value to convert; may be a number or a string |

## Returns

`number`

The converted integer; NaN on conversion failure

## Examples

```ts
toInt('123'); // returns 123
```

```ts
toInt(123.45); // returns 123 (rounded down)
```

```ts
toInt('-123.45'); // returns -123 (rounded up: -123.45 -> -123)
```

```ts
toInt('123.9'); // returns 123 (rounded down)
```

```ts
toInt('-123.1'); // returns -123 (rounded up)
```

```ts
toInt('abc'); // returns NaN (cannot convert to a number)
```

```ts
toInt(null); // returns NaN
**Note:** uses Math.floor() for positive numbers and Math.ceil() for negative numbers
**Note:** this differs from parseInt(), which always truncates toward zero
```
