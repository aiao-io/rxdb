# generateKeysBetween()

```ts
function generateKeysBetween(
   a, 
   b, 
   n, 
   digits?, 
   intDigits?
): string[];
```

Defined in: [packages/utils/src/indexing/fractional-indexing.ts:591](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/indexing/fractional-indexing.ts#L591)

Generates n ordering keys between two ordering keys
For batch-inserting multiple items into an ordered list

Preconditions are the same as [generateKeyBetween](generateKeyBetween.md), plus `n >= 0`. Returns n pairwise-distinct, already-sorted keys: when both `a` and `b` are null, returns `['a0', 'a1', ...]`; when one is null, returns consecutive "integer" keys; otherwise returns comparatively short keys between `a` and `b`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `a` | `OrderKey` | Lower-bound key (null means the start of the list) |
| `b` | `OrderKey` | Upper-bound key (null means the end of the list) |
| `n` | `number` | Number of keys to generate |
| `digits?` | `string` | Digit alphabet; semantics documented in [generateKeyBetween](generateKeyBetween.md) |
| `intDigits?` | `string` | Head alphabet; semantics documented in [generateKeyBetween](generateKeyBetween.md) |

## Returns

`string`[]

The generated ordering keys, in order

## Throws

Thrown when the arguments are invalid

## Example

```ts
// generates 3 keys to insert between two existing keys
const keys = generateKeysBetween('a1', 'a2', 3);
// returns: ['a1V', 'a1l', 'a1v']
```
