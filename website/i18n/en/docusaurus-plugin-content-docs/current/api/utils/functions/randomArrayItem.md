# randomArrayItem()

```ts
function randomArrayItem<T>(array): T | undefined;
```

Defined in: [packages/utils/src/random/randomArrayItem.ts:7](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/random/randomArrayItem.ts#L7)

Picks a random element from an array.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type           | Description     |
| --------- | -------------- | --------------- |
| `array`   | readonly `T`[] | Candidate array |

## Returns

`T` \| `undefined`

A random element; undefined for an empty array
