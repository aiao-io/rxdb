# createEntityDialogController()

```ts
function createEntityDialogController<TResult, TData>(options?): EntityDialogController<TResult, TData>;
```

Defined in: packages/rxdb-model/dist/entity-dialog/headless.d.ts:38

Creates a lifecycle controller independent of any specific dialog implementation.

## Type Parameters

| Type Parameter                                | Default type |
| --------------------------------------------- | ------------ |
| <a id="type-parameter-tresult"></a> `TResult` | `unknown`    |
| <a id="type-parameter-tdata"></a> `TData`     | `unknown`    |

## Parameters

| Parameter  | Type                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------ |
| `options?` | [`EntityDialogControllerOptions`](../interfaces/EntityDialogControllerOptions.md)&lt;`TData`&gt; |

## Returns

[`EntityDialogController`](../classes/EntityDialogController.md)&lt;`TResult`, `TData`&gt;
