# createQueryBuilderHeadless

```ts
const createQueryBuilderHeadless: <T>(options) => QueryBuilderController<T> = createQueryBuilderController;
```

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:197](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L197)

Headless alias of the query builder controller factory.

Creates a headless controller reusing an existing query service.

## Type Parameters

| Type Parameter                          | Default type                        |
| --------------------------------------- | ----------------------------------- |
| <a id="type-parameter-__typet"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Parameters

| Parameter  | Type                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------- |
| `options?` | [`QueryBuilderControllerOptions`](../interfaces/QueryBuilderControllerOptions.md)&lt;`T`&gt; |

## Returns

[`QueryBuilderController`](../classes/QueryBuilderController.md)&lt;`T`&gt;
