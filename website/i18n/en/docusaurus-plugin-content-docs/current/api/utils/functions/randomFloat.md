# randomFloat()

```ts
function randomFloat(min?, max?): number;
```

Defined in: [packages/utils/src/random/randomFloat.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/random/randomFloat.ts#L17)

Generates a random float in the given range
Uses Math.random() to produce a number between 0 and 1, then maps it to the range

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `min?` | `number` | `Number.MIN_SAFE_INTEGER` | Minimum value (inclusive); defaults to Number.MIN_SAFE_INTEGER |
| `max?` | `number` | `Number.MAX_SAFE_INTEGER` | Maximum value (exclusive); defaults to Number.MAX_SAFE_INTEGER |

## Returns

`number`

A random float in the given range

## Examples

```ts
randomFloat(0, 10); // returns a random float between 0 and 10, e.g. 3.14159
```

```ts
randomFloat(-5, 5); // returns a random float between -5 and 5
```

```ts
randomFloat(); // returns any safe float
**Note:** the result range is [min, max), i.e. the minimum is inclusive but the maximum is not
**Note:** uses Math.random(), so the distribution is uniform
**Note:** if min >= max, the result may not meet expectations
```
