# createEntityListController()

```ts
function createEntityListController<T>(options?): EntityListController<T>;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:480](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L480)

Creates an entity list controller that is independent of the presentation layer.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`EntityListControllerOptions`](../interfaces/EntityListControllerOptions.md)&lt;`T`&gt; |

## Returns

[`EntityListController`](../classes/EntityListController.md)&lt;`T`&gt;
