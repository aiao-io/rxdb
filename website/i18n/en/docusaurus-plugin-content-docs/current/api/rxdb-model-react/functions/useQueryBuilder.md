# useQueryBuilder()

```ts
function useQueryBuilder<T>(options?): UseQueryBuilderResult<T>;
```

Defined in: [packages/rxdb-model-react/src/headless.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/headless.ts#L48)

React query builder binding; the controller is kept in component state and is garbage-collected together with the component on unmount.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`QueryBuilderControllerOptions`](../interfaces/QueryBuilderControllerOptions.md)&lt;`T`&gt; |

## Returns

[`UseQueryBuilderResult`](../interfaces/UseQueryBuilderResult.md)&lt;`T`&gt;
