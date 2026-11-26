# createEntityDialogHeadless

```ts
const createEntityDialogHeadless: <TResult, TData>(options) => EntityDialogController<TResult, TData> =
  createEntityDialogController;
```

Defined in: [packages/rxdb-model/src/entity-dialog/headless.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-dialog/headless.ts#L107)

Headless alias of the dialog controller factory.

Creates a lifecycle controller independent of a specific popup implementation.

## Type Parameters

| Type Parameter                                      | Default type |
| --------------------------------------------------- | ------------ |
| <a id="type-parameter-__typetresult"></a> `TResult` | `unknown`    |
| <a id="type-parameter-__typetdata"></a> `TData`     | `unknown`    |

## Parameters

| Parameter  | Type                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------ |
| `options?` | [`EntityDialogControllerOptions`](../interfaces/EntityDialogControllerOptions.md)&lt;`TData`&gt; |

## Returns

[`EntityDialogController`](../classes/EntityDialogController.md)&lt;`TResult`, `TData`&gt;
