# createQueryBuilderService()

```ts
function createQueryBuilderService<T>(options?): QueryBuilderService<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/query-builder.service.d.ts:176

Factory function that creates a QueryBuilderService instance

## Type Parameters

| Type Parameter                    | Default type                        |
| --------------------------------- | ----------------------------------- |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Parameters

| Parameter  | Type                                                                                   | Description     |
| ---------- | -------------------------------------------------------------------------------------- | --------------- |
| `options?` | [`QueryBuilderServiceOptions`](../interfaces/QueryBuilderServiceOptions.md)&lt;`T`&gt; | Service options |

## Returns

[`QueryBuilderService`](../classes/QueryBuilderService.md)&lt;`T`&gt;

A new QueryBuilderService instance
