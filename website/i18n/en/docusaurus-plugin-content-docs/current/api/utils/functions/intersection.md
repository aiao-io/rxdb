# intersection()

```ts
function intersection<T>(...arrays): T[];
```

Defined in: [packages/utils/src/array/intersection.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/array/intersection.ts#L29)

Computes the intersection of multiple arrays, returning elements present in all inputs
Elements are compared with strict equality (===); the result preserves element order from the first array
A single input array returns its deduplicated version

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter   | Type             | Description          |
| ----------- | ---------------- | -------------------- |
| ...`arrays` | readonly `T`[][] | Any number of arrays |

## Returns

`T`[]

A new array containing the elements common to all input arrays (automatically deduplicated)

## Examples

```ts
intersection([1, 2, 3], [2, 3, 4], [2, 5]);
// returns [2] (multi-array intersection)
```

```ts
intersection(['a', 'b'], ['b', 'a'], ['b']);
// returns ['b'] (preserves the first array's element order)
```

```ts
intersection([1, 2, 2, 3], [2, 2, 4]);
// returns [2] (the result is deduplicated automatically)
```

```ts
intersection([1, 2]); // returns [1, 2] (a single array is deduplicated)
```

```ts
intersection([], [1, 2]); // returns [] (the result is empty when any array is empty)
```

```ts
intersection([{ id: 1 }], [{ id: 1 }]);
// returns [] (different object references count as different elements)
**Note:** elements are compared with strict equality (===), so 1 and '1' are treated as different elements
**Note:** the result array is automatically deduplicated even when the inputs contain duplicates
**Note:** returns an empty array when no array argument is given
**Warning:** for large arrays this implementation may have performance issues (O(n^2) time complexity)
```
