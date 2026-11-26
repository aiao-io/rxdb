# useEntityListHeadless

```ts
const useEntityListHeadless: <T>(options) => UseEntityListResult<T> = useEntityList;
```

Defined in: [packages/rxdb-model-react/src/headless.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/headless.ts#L87)

Equivalent named alias of useEntityListHeadless.

React entity list binding; query, ordering, pagination, records, and capability inputs sync only the items that actually changed.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-__typet"></a> `T` *extends* [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`EntityListControllerOptions`](../interfaces/EntityListControllerOptions.md)&lt;`T`&gt; |

## Returns

[`UseEntityListResult`](../interfaces/UseEntityListResult.md)&lt;`T`&gt;
