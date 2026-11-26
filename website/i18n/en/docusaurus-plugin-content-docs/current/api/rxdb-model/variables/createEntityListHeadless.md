# createEntityListHeadless

```ts
const createEntityListHeadless: <T>(options) => EntityListController<T> = createEntityListController;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:486](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L486)

Headless alias of the entity list controller factory.

Creates an entity list controller with no presentation-layer dependency.

## Type Parameters

| Type Parameter                                                                                          | Default type                                          |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| <a id="type-parameter-__typet"></a> `T` _extends_ [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Parameters

| Parameter  | Type                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------- |
| `options?` | [`EntityListControllerOptions`](../interfaces/EntityListControllerOptions.md)&lt;`T`&gt; |

## Returns

[`EntityListController`](../classes/EntityListController.md)&lt;`T`&gt;
