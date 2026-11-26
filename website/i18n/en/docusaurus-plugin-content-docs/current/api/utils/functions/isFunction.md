# isFunction()

```ts
function isFunction<T>(value): value is T & CallablePart<T>;
```

Defined in: [packages/utils/src/types/isFunction.ts:6](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/types/isFunction.ts#L6)

Checks whether a value is a callable function, preserving the existing function signature.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `T` |

## Returns

`value is T & CallablePart<T>`
