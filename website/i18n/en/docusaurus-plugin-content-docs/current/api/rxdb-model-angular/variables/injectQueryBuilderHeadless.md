# injectQueryBuilderHeadless

```ts
const injectQueryBuilderHeadless: <T>(options) => InjectQueryBuilderReturn<T> = injectQueryBuilder;
```

Defined in: [packages/rxdb-model-angular/src/headless/bindings.ts:118](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/headless/bindings.ts#L118)

Equivalent naming alias of injectQueryBuilderHeadless.

Injects a reactive query builder controller.

## Type Parameters

| Type Parameter                          | Default type                        |
| --------------------------------------- | ----------------------------------- |
| <a id="type-parameter-__typet"></a> `T` | `Record`&lt;`string`, `unknown`&gt; |

## Parameters

| Parameter  | Type                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options?` | [`AngularHeadlessOptions`](../type-aliases/AngularHeadlessOptions.md)&lt;[`QueryBuilderControllerOptions`](../interfaces/QueryBuilderControllerOptions.md)&lt;`T`&gt;&gt; |

## Returns

[`InjectQueryBuilderReturn`](../interfaces/InjectQueryBuilderReturn.md)&lt;`T`&gt;
