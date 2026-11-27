# createQueryBuilderController()

```ts
function createQueryBuilderController<T>(options?): QueryBuilderController<T>;
```

Defined in: packages/rxdb-model/dist/query-builder/services/headless.d.ts:67

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
