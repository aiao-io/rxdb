# needArray()

```ts
function needArray<T>(value): ArrayType<T>[];
```

Defined in: [packages/utils/src/array/needArray.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/array/needArray.ts#L12)

Normalizes any value to an array

## Type Parameters

| Type Parameter                    | Default type | Description            |
| --------------------------------- | ------------ | ---------------------- |
| <a id="type-parameter-t"></a> `T` | `unknown`    | The input value's type |

## Parameters

| Parameter | Type | Description                        |
| --------- | ---- | ---------------------------------- |
| `value`   | `T`  | The value to normalize to an array |

## Returns

`ArrayType`&lt;`T`&gt;[]

The original array, an empty array, or a single-element array containing the input value
