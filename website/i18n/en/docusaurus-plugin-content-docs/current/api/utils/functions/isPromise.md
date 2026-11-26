# isPromise()

```ts
function isPromise<T>(value): value is Promise<T>;
```

Defined in: [packages/utils/src/types/isPromise.ts:4](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/types/isPromise.ts#L4)

Checks whether a value has a callable then method.

## Type Parameters

| Type Parameter                    | Default type |
| --------------------------------- | ------------ |
| <a id="type-parameter-t"></a> `T` | `unknown`    |

## Parameters

| Parameter | Type      |
| --------- | --------- |
| `value`   | `unknown` |

## Returns

`value is Promise<T>`
