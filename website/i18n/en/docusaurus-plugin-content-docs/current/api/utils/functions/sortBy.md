# sortBy()

```ts
function sortBy(key): (a, b) => number;
```

Defined in: [packages/utils/src/array/sortBy.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/array/sortBy.ts#L17)

Creates a comparator that sorts by a direct property in natural ascending order

## Parameters

| Parameter | Type          | Description                         |
| --------- | ------------- | ----------------------------------- |
| `key`     | `PropertyKey` | The direct property name to sort by |

## Returns

A comparator usable with Array.sort

(`a`, `b`) => `number`
