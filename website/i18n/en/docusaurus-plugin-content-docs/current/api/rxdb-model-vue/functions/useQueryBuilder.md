# useQueryBuilder()

```ts
function useQueryBuilder<T>(options?): UseQueryBuilderResult<T>;
```

Defined in: [packages/rxdb-model-vue/src/headless.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/headless.ts#L50)

Vue query builder binding, deeply syncing field metadata.

## Type Parameters

| Type Parameter                    | Default type                        |
| --------------------------------- | ----------------------------------- |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Parameters

| Parameter  | Type                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------- |
| `options?` | [`QueryBuilderControllerOptions`](../interfaces/QueryBuilderControllerOptions.md)&lt;`T`&gt; |

## Returns

[`UseQueryBuilderResult`](../interfaces/UseQueryBuilderResult.md)&lt;`T`&gt;
