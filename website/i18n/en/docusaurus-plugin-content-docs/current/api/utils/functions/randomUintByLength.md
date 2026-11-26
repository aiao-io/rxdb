# randomUintByLength()

```ts
function randomUintByLength(length?): number;
```

Defined in: [packages/utils/src/random/randomUintByLength.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/random/randomUintByLength.ts#L22)

Generates a random positive integer with the given number of digits
Implemented by generating a random digit string and converting it to a number

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `length?` | `number` | `15` | Number of digits; defaults to 15 (not 16) |

## Returns

`number`

A random positive integer with the given number of digits

## Examples

```ts
randomUintByLength(3); // returns a 3-digit random number, e.g. 123, 456, 789
```

```ts
randomUintByLength(1); // returns a 1-digit random number, e.g. 1, 2, 3, 4, 5, 6, 7, 8, 9 (never 0)
```

```ts
randomUintByLength(5); // returns a 5-digit random number, e.g. 12345
**Note:** the first digit is never 0, guaranteeing the correct number of digits
**Note:** uses randomUintString to generate the string, then converts it to a number
```

## Throws

when length is not an integer in 1..15

**Note:** the default is **15**, not 16. `Number.MAX_SAFE_INTEGER` is 9007199254740991 (16 digits); a 16-digit random number very likely exceeds it and `parseInt` would silently lose precision — a default argument that can produce a non-safe integer is unacceptable. For longer values use [randomUintString](randomUintString.md) directly (UTL-027).
