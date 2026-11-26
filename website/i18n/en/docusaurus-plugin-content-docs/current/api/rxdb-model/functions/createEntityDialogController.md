# createEntityDialogController()

```ts
function createEntityDialogController<TResult, TData>(options?): EntityDialogController<TResult, TData>;
```

Defined in: [packages/rxdb-model/src/entity-dialog/headless.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-dialog/headless.ts#L101)

Creates a lifecycle controller that is independent of any specific dialog implementation.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-tresult"></a> `TResult` | `unknown` |
| <a id="type-parameter-tdata"></a> `TData` | `unknown` |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`EntityDialogControllerOptions`](../interfaces/EntityDialogControllerOptions.md)&lt;`TData`&gt; |

## Returns

[`EntityDialogController`](../classes/EntityDialogController.md)&lt;`TResult`, `TData`&gt;
