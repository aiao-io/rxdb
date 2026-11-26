# generateKeyBetween()

```ts
function generateKeyBetween(
   a, 
   b, 
   digits?, 
   intDigits?
): string;
```

Defined in: [packages/utils/src/indexing/fractional-indexing.ts:492](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/indexing/fractional-indexing.ts#L492)

Generates a new ordering key between two ordering keys
Used for inserting a new item into an ordered list, supporting insertion at any position

`a` is the lower bound (an ordering key, or null for the start of the list), `b` is the upper bound (an ordering key, or null for the end of the list). When both are non-null they may be passed in either order: a reversed order is swapped automatically; this is only a convenience for callers and does not affect the properties of the generated key.

Note that `digits` only defines the **digit values** of the key. The integer part of each key also starts with a length marker (head) drawn from the `intDigits` alphabet. The head only appears at the first position and is only compared with other heads, so `digits` and `intDigits` may overlap (or even be identical) and keys still order correctly.

`intDigits` defaults to `digits`, so a base-10 alphabet produces keys like `50` / `600` / `49` that carry their own head characters. When `digits` is also omitted it falls back to [BASE\_52\_DIGITS](../variables/BASE_52_DIGITS.md) (A-Z / a-z), i.e. the classic `a0` / `b00` / `Z9` shape. Note that explicitly passing `digits` (even [BASE\_62\_DIGITS](../variables/BASE_62_DIGITS.md)) makes the key carry its own head; only omitting `digits` entirely yields A-Z / a-z heads.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `a` | `OrderKey` | The lower-bound key (null means the start of the list) |
| `b` | `OrderKey` | The upper-bound key (null means the end of the list) |
| `digits?` | `string` | The digit alphabet; characters must be single-byte (char codes 0-255) and in ascending char-code order; defaults to [BASE\_62\_DIGITS](../variables/BASE_62_DIGITS.md). Because `intDigits` defaults to `digits`, a `digits` of odd length must be paired with an explicit even-length `intDigits` |
| `intDigits?` | `string` | The head alphabet; must have even length and be in ascending char-code order; the first half are negative-length heads, the second half positive-length heads. The outermost characters mark the longest integer part; the two characters straddling the midpoint mark the shortest (length 2). The integer part can only grow up to the outermost heads, so a shorter alphabet limits how large / small the integer part of a key can become |

## Returns

`string`

The newly generated ordering key

## Throws

Throws an error when the arguments are invalid or no key can be generated

## Examples

```ts
// insert at the start of the list
const firstKey = generateKeyBetween(null, 'a1'); // 'a0V'
```

```ts
// insert at the end of the list
const lastKey = generateKeyBetween('a1', null); // 'a2'
```

```ts
// insert between two keys
const middleKey = generateKeyBetween('a1', 'a2'); // 'a1V'
```

```ts
// base-10: head characters come from digits itself; 0-4 are negative-length heads, 5-9 positive-length heads, and 4/5 mark the shortest integer part
generateKeyBetween(null, null, '0123456789'); // '50'
```
