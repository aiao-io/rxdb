# getMonotonicUpdatedAt()

```ts
function getMonotonicUpdatedAt<T>(entity, preferred?): Date;
```

Defined in: [packages/rxdb-adapter-pglite/src/pglite.utils.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/pglite.utils.ts#L64)

Guarantees that updatedAt increases monotonically: when multiple updates happen within the same millisecond it increments by 1ms, so the sync side's comparison by updatedAt does not break down.

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter    | Type                      |
| ------------ | ------------------------- |
| `entity`     | `InstanceType`&lt;`T`&gt; |
| `preferred?` | `Date`                    |

## Returns

`Date`
