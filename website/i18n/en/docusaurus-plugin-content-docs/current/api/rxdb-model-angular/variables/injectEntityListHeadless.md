# injectEntityListHeadless

```ts
const injectEntityListHeadless: <T>(options) => InjectEntityListReturn<T> = injectEntityList;
```

Defined in: [packages/rxdb-model-angular/src/headless/bindings.ts:133](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/headless/bindings.ts#L133)

Equivalent naming alias of injectEntityListHeadless.

Injects a reactive entity list controller; query, ordering, pagination, record, and capability inputs only sync items that actually changed.

## Type Parameters

| Type Parameter                                                                                          | Default type                                          |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| <a id="type-parameter-__typet"></a> `T` _extends_ [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Parameters

| Parameter  | Type                                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options?` | [`AngularHeadlessOptions`](../type-aliases/AngularHeadlessOptions.md)&lt;[`EntityListControllerOptions`](../interfaces/EntityListControllerOptions.md)&lt;`T`&gt;&gt; |

## Returns

[`InjectEntityListReturn`](../interfaces/InjectEntityListReturn.md)&lt;`T`&gt;
