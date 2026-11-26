# cloneStructured()

```ts
function cloneStructured<T>(value, seen?): T;
```

Defined in: [packages/rxdb-model/src/structural-equal.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/structural-equal.ts#L15)

Deep-clones structured values in model state, preserving dates, byte sequences, and circular references.

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type                                 |
| --------- | ------------------------------------ |
| `value`   | `T`                                  |
| `seen?`   | `WeakMap`&lt;`object`, `unknown`&gt; |

## Returns

`T`
