# useEntityList()

```ts
function useEntityList<T>(options?): UseEntityListResult<T>;
```

Defined in: [packages/rxdb-model-react/src/headless.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/headless.ts#L81)

React entity list binding; query, ordering, pagination, record, and capability inputs only sync the items that actually changed.

## Type Parameters

| Type Parameter                                                                                    | Default type                                          |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Parameters

| Parameter  | Type                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------- |
| `options?` | [`EntityListControllerOptions`](../interfaces/EntityListControllerOptions.md)&lt;`T`&gt; |

## Returns

[`UseEntityListResult`](../interfaces/UseEntityListResult.md)&lt;`T`&gt;
