# createQueryBuilderController()

```ts
function createQueryBuilderController<T>(options?): QueryBuilderController<T>;
```

Defined in: [packages/rxdb-model/src/query-builder/services/headless.ts:190](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/services/headless.ts#L190)

Creates a headless controller that reuses existing query services.

## Type Parameters

| Type Parameter                    | Default type                        |
| --------------------------------- | ----------------------------------- |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Parameters

| Parameter  | Type                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------- |
| `options?` | [`QueryBuilderControllerOptions`](../interfaces/QueryBuilderControllerOptions.md)&lt;`T`&gt; |

## Returns

[`QueryBuilderController`](../classes/QueryBuilderController.md)&lt;`T`&gt;
