# isValidOrderKey()

```ts
function isValidOrderKey(key, digits?, intDigits?): key is string;
```

Defined in: [packages/utils/src/indexing/fractional-indexing.ts:237](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/indexing/fractional-indexing.ts#L237)

Determines whether a value is a valid ordering key under the given alphabet

Compared with the input validation inside [generateKeyBetween](generateKeyBetween.md), this function additionally requires every character after the head character to belong to the `digits` alphabet, so it can recognize keys generated with a different alphabet (e.g. `V0` from explicitly passing [BASE\_62\_DIGITS](../variables/BASE_62_DIGITS.md) is invalid under the default alphabet). Does not throw; suitable for validating externally supplied keys before writing.

## Parameters

| Parameter    | Type      | Description                                                                    |
| ------------ | --------- | ------------------------------------------------------------------------------ |
| `key`        | `unknown` | The value to validate                                                          |
| `digits?`    | `string`  | Digit alphabet; same meaning as in [generateKeyBetween](generateKeyBetween.md) |
| `intDigits?` | `string`  | Head alphabet; same meaning as in [generateKeyBetween](generateKeyBetween.md)  |

## Returns

`key is string`

`true` when valid

## Throws

Thrown when `digits` / `intDigits` themselves are invalid

## Example

```ts
isValidOrderKey('a0'); // true
isValidOrderKey('a00'); // false: fractional part ends with zero
isValidOrderKey('V0'); // false: a key generated with the BASE_62 head alphabet
```
