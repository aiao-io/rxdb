# flattenDeep()

```ts
function flattenDeep<T>(array): T[];
```

Defined in: [packages/utils/src/array/flattenDeep.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/array/flattenDeep.ts#L11)

Fully flattens arrays nested at any depth into a one-dimensional array

## Type Parameters

| Type Parameter                    | Description                         |
| --------------------------------- | ----------------------------------- |
| <a id="type-parameter-t"></a> `T` | The base type of the array elements |

## Parameters

| Parameter | Type                     | Description                  |
| --------- | ------------------------ | ---------------------------- |
| `array`   | `NestedArray`&lt;`T`&gt; | An array nested at any depth |

## Returns

`T`[]

The fully flattened one-dimensional array

## Throws

TypeError on circular references
