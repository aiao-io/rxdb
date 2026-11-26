# orderBy()

```ts
function orderBy<T>(collection, iteratees?, orders?): T[];
```

Defined in: [packages/utils/src/array/orderBy.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/array/orderBy.ts#L18)

Sorts an array by multiple fields with the given properties and sort directions

## Type Parameters

| Type Parameter                    | Description        |
| --------------------------------- | ------------------ |
| <a id="type-parameter-t"></a> `T` | Array element type |

## Parameters

| Parameter    | Type          | Default value | Description                                          |
| ------------ | ------------- | ------------- | ---------------------------------------------------- |
| `collection` | `T`[]         | `undefined`   | The array to sort                                    |
| `iteratees?` | `string`[]    | `[]`          | Direct property names; nested paths are not resolved |
| `orders?`    | `SortOrder`[] | `[]`          | Sort direction for each property; defaults to asc    |

## Returns

`T`[]

A new sorted array
