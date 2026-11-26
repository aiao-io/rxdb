# flatten()

```ts
function flatten<T>(array): T[];
```

Defined in: [packages/utils/src/array/flatten.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/array/flatten.ts#L24)

Flattens an array one level deep
Only directly nested array elements are handled; no deep flattening

## Type Parameters

| Type Parameter                    | Description                         |
| --------------------------------- | ----------------------------------- |
| <a id="type-parameter-t"></a> `T` | The base type of the array elements |

## Parameters

| Parameter | Type             | Description                                                              |
| --------- | ---------------- | ------------------------------------------------------------------------ |
| `array`   | (`T` \| `T`[])[] | Input array containing base-type elements and/or one-level nested arrays |

## Returns

`T`[]

A new flattened array; all elements are of the base type T

## Examples

```ts
flatten([1, [2, 3], 4]);
// returns [1, 2, 3, 4]
```

```ts
flatten(['a', ['b', ['c']], 'd']);
// returns ['a', 'b', ['c'], 'd'] (flattens one level only, keeping the deeper nested array)
```

```ts
flatten([[], [1, 2], 3]); // returns [1, 2, 3] (empty arrays are handled)
```

```ts
flatten([1, 2, 3]); // returns [1, 2, 3] (returns the original elements when nothing is nested)
```

```ts
flatten([]); // returns [] (empty input array)
**Note:** unlike flattenDeep: this function flattens one level only, while flattenDeep recursively flattens all levels
**Note:** the function returns a new array and does not modify the input array
**Note:** non-array elements are included in the result directly
```
