# createQueryTableHeadless

```ts
const createQueryTableHeadless: <T>(options) => QueryTableController<T> = createQueryTableController;
```

Defined in: [packages/rxdb-model/src/entity-table/headless.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/headless.ts#L40)

Headless alias of the query table controller factory.

Creates a query table controller without assembling VTable.

## Type Parameters

| Type Parameter                                                                                          | Default type                                          |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| <a id="type-parameter-__typet"></a> `T` _extends_ [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Parameters

| Parameter  | Type                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------- |
| `options?` | [`QueryTableControllerOptions`](../interfaces/QueryTableControllerOptions.md)&lt;`T`&gt; |

## Returns

[`QueryTableController`](../classes/QueryTableController.md)&lt;`T`&gt;
