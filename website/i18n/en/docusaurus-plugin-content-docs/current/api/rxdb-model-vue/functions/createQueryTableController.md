# createQueryTableController()

```ts
function createQueryTableController<T>(options?): QueryTableController<T>;
```

Defined in: packages/rxdb-model/dist/entity-table/headless.d.ts:19

Creates a query table controller without a VTable attached.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`QueryTableControllerOptions`](../interfaces/QueryTableControllerOptions.md)&lt;`T`&gt; |

## Returns

[`QueryTableController`](../classes/QueryTableController.md)&lt;`T`&gt;
