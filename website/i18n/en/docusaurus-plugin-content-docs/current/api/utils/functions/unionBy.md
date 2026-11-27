# unionBy()

```ts
function unionBy<T>(array, getKey): T[];
```

Defined in: [packages/utils/src/array/unionBy.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/array/unionBy.ts#L21)

Deduplicates an array by the given key function, returning a new array of unique elements
The key function extracts each element's unique identifier; the first occurrence is kept

## Type Parameters

| Type Parameter                    | Default type | Description              |
| --------------------------------- | ------------ | ------------------------ |
| <a id="type-parameter-t"></a> `T` | `unknown`    | The array element's type |

## Parameters

| Parameter | Type                             | Description                                                 |
| --------- | -------------------------------- | ----------------------------------------------------------- |
| `array`   | `T`[]                            | The array to deduplicate                                    |
| `getKey`  | (`item`) => `string` \| `number` | Key function that extracts each element's unique identifier |

## Returns

`T`[]

A new deduplicated array, preserving the elements' order of appearance in the original array

## Examples

```ts
unionBy(
  [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
    { id: 1, name: 'Alice2' }
  ],
  item => item.id
);
// returns [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] (deduplicated by id)
```

```ts
unionBy(['apple', 'banana', 'Apple'], item => item.toLowerCase());
// returns ['apple', 'banana'] (deduplicated by lowercase)
```

```ts
unionBy([1, 2, 3, 2, 1], item => item);
// returns [1, 2, 3] (primitive deduplication)
**Note:** the key function's return value must be a string or number
**Note:** the first occurrence is kept; later duplicates are filtered out
**Note:** returns a new array; the original array is not modified
```
