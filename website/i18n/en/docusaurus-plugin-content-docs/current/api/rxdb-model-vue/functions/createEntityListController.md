# createEntityListController()

```ts
function createEntityListController<T>(options?): EntityListController<T>;
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:131

Creates an entity list controller that does not depend on a presentation layer.

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
