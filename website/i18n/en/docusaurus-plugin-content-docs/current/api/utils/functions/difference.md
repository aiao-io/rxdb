# difference()

```ts
function difference<T>(array1, array2): T[];
```

Defined in: [packages/utils/src/array/difference.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/array/difference.ts#L30)

Computes the difference of two arrays, returning elements present only in the first array and not in the second
Elements are compared with strict equality (===), so objects are equal only when they are the same reference
The result preserves the order of appearance in the original array

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | The array element's type |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `array1` | `T`[] | Source array from which the differing elements are taken |
| `array2` | `T`[] | Comparison array used to decide which elements to exclude |

## Returns

`T`[]

A new array containing all elements present only in array1 (original order preserved)

## Examples

```ts
difference([0, 1, 2], [2, 3, 4]);
// returns [0, 1] (primitive comparison)
```

```ts
difference(['a', 'b', 'c'], ['b', 'd']);
// returns ['a', 'c'] (string comparison)
```

```ts
difference([1, 2, 2, 3], [2]);
// returns [1, 3] (duplicates in array1 that are excluded are deduplicated automatically)
```

```ts
difference([], [1, 2]); // returns [] (empty source array)
```

```ts
difference([1, 2], []); // returns [1, 2] (empty comparison array)
```

```ts
difference([{ id: 1 }], [{ id: 1 }]);
// returns [{ id: 1 }] (different object references count as different elements)
**Note:** implemented with Array.prototype.includes, so comparison uses strict equality (===)
**Note:** the result never contains elements of array1 that also exist in array2, even when they appear multiple times
**Warning:** no deep object comparison; only reference identity is compared
```
