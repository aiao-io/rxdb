# createQueryBuilderService()

```ts
function createQueryBuilderService<T>(options?): QueryBuilderService<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/query-builder.service.ts:573](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L573)

Factory function that creates a QueryBuilderService instance.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`QueryBuilderServiceOptions`](../interfaces/QueryBuilderServiceOptions.md)&lt;`T`&gt; | The service options |

## Returns

[`QueryBuilderService`](../classes/QueryBuilderService.md)&lt;`T`&gt;

A new QueryBuilderService instance
