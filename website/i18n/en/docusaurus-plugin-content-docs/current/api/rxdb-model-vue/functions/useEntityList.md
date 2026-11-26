# useEntityList()

```ts
function useEntityList<T>(options?): UseEntityListResult<T>;
```

Defined in: [packages/rxdb-model-vue/src/headless.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/headless.ts#L96)

Vue entity list binding; query, ordering, pagination, records and capability inputs only sync items that actually changed.

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
