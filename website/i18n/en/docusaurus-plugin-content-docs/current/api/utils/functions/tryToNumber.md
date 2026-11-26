# tryToNumber()

```ts
function tryToNumber<T>(value): number | T;
```

Defined in: [packages/utils/src/number/tryToNumber.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/number/tryToNumber.ts#L26)

Safely converts a value to a number, converting only when a valid number results
If the value cannot become a valid number (NaN, infinity, etc.), returns the original value unchanged

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type | Description                 |
| --------- | ---- | --------------------------- |
| `value`   | `T`  | The value to try to convert |

## Returns

`number` \| `T`

The converted number (on success) or the original value (on failure)

## Examples

```ts
tryToNumber('123'); // returns 123 (a numeric string converted to a number)
```

```ts
tryToNumber('123.45'); // returns 123.45 (a float string)
```

```ts
tryToNumber('abc'); // returns 'abc' (cannot convert to a number; the original value is returned)
```

```ts
tryToNumber(true); // returns true (booleans are not converted)
```

```ts
tryToNumber(null); // returns null (null is not converted)
```

```ts
tryToNumber(''); // returns '' (an empty string is not converted)
```

```ts
tryToNumber('Infinity'); // returns 'Infinity' (an infinity string is not converted)
**Note:** uses canBeNumber to check whether the value can be converted to a number
**Note:** even when the canBeNumber check passes, the conversion result is still verified to be a valid number
**Note:** for unconvertible values the original value is always returned; no error is thrown
```
