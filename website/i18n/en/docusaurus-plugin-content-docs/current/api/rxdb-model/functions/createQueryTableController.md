# createQueryTableController()

```ts
function createQueryTableController<T>(options?): QueryTableController<T>;
```

Defined in: [packages/rxdb-model/src/entity-table/headless.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/headless.ts#L34)

Creates a query table controller without assembling a VTable.

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
