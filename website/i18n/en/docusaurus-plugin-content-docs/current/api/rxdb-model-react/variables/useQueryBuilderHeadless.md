# useQueryBuilderHeadless

```ts
const useQueryBuilderHeadless: <T>(options) => UseQueryBuilderResult<T> = useQueryBuilder;
```

Defined in: [packages/rxdb-model-react/src/headless.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/headless.ts#L60)

Equivalent named alias of useQueryBuilderHeadless.

React query builder binding; the controller is kept in component state and reclaimed with the component on unmount.

## Type Parameters

| Type Parameter                          | Default type                        |
| --------------------------------------- | ----------------------------------- |
| <a id="type-parameter-__typet"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Parameters

| Parameter  | Type                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------- |
| `options?` | [`QueryBuilderControllerOptions`](../interfaces/QueryBuilderControllerOptions.md)&lt;`T`&gt; |

## Returns

[`UseQueryBuilderResult`](../interfaces/UseQueryBuilderResult.md)&lt;`T`&gt;
