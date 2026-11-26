# chunk()

```ts
function chunk<T>(array, size): T[][];
```

Defined in: [packages/utils/src/array/chunk.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/array/chunk.ts#L15)

Splits an array into chunks of the given size
When the array length is not divisible by the chunk size, the last chunk contains the remaining elements

## Type Parameters

| Type Parameter                    | Description                   |
| --------------------------------- | ----------------------------- |
| <a id="type-parameter-t"></a> `T` | The element type of the array |

## Parameters

| Parameter | Type           | Description                                                |
| --------- | -------------- | ---------------------------------------------------------- |
| `array`   | readonly `T`[] | The array to split (read-only; must not be null/undefined) |
| `size`    | `number`       | The size of each chunk; must be a positive integer         |

## Returns

`T`[][]

A new array composed of the chunks

## Throws

Thrown when array is not an array or size is not a number

## Throws

Thrown when size is not positive

## Example

```ts
chunk(['a', 'b', 'c', 'd'], 2);
// returns [['a', 'b'], ['c', 'd']]
```
