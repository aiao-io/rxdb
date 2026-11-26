# randomInt()

```ts
function randomInt(min?, max?): number;
```

Defined in: [packages/utils/src/random/randomInt.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/random/randomInt.ts#L17)

Generates a random integer in the given range
Uses Math.random() to produce a random number, then Math.floor() to round down

## Parameters

| Parameter | Type     | Default value             | Description                                                    |
| --------- | -------- | ------------------------- | -------------------------------------------------------------- |
| `min?`    | `number` | `Number.MIN_SAFE_INTEGER` | Minimum value (inclusive); defaults to Number.MIN_SAFE_INTEGER |
| `max?`    | `number` | `Number.MAX_SAFE_INTEGER` | Maximum value (inclusive); defaults to Number.MAX_SAFE_INTEGER |

## Returns

`number`

A random integer in the given range

## Examples

```ts
randomInt(1, 10); // returns a random integer between 1 and 10, e.g. 5
```

```ts
randomInt(0, 1); // returns 0 or 1
```

```ts
randomInt(-5, 5); // returns a random integer between -5 and 5
**Note:** the result range is [min, max], i.e. both bounds are inclusive
**Note:** uses Math.floor() to guarantee an integer result
**Note:** if min > max, the result may not meet expectations
```
