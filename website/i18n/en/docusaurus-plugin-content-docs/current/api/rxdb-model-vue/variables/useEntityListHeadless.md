# useEntityListHeadless

```ts
const useEntityListHeadless: <T>(options) => UseEntityListResult<T> = useEntityList;
```

Defined in: [packages/rxdb-model-vue/src/headless.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/headless.ts#L106)

Equivalent naming alias of useEntityListHeadless.

Vue entity list binding; only syncs query, ordering, pagination, record and capability inputs whose items actually changed.

## Type Parameters

| Type Parameter                                                                                          | Default type                                          |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| <a id="type-parameter-__typet"></a> `T` _extends_ [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Parameters

| Parameter  | Type                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------- |
| `options?` | [`EntityListControllerOptions`](../interfaces/EntityListControllerOptions.md)&lt;`T`&gt; |

## Returns

[`UseEntityListResult`](../interfaces/UseEntityListResult.md)&lt;`T`&gt;
