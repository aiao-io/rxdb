# injectQueryBuilder()

```ts
function injectQueryBuilder<T>(options?): InjectQueryBuilderReturn<T>;
```

Defined in: [packages/rxdb-model-angular/src/headless/bindings.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/headless/bindings.ts#L110)

Injects a reactive query builder controller.

## Type Parameters

| Type Parameter                    | Default type                        |
| --------------------------------- | ----------------------------------- |
| <a id="type-parameter-t"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Parameters

| Parameter  | Type                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options?` | [`AngularHeadlessOptions`](../type-aliases/AngularHeadlessOptions.md)&lt;[`QueryBuilderControllerOptions`](../interfaces/QueryBuilderControllerOptions.md)&lt;`T`&gt;&gt; |

## Returns

[`InjectQueryBuilderReturn`](../interfaces/InjectQueryBuilderReturn.md)&lt;`T`&gt;
