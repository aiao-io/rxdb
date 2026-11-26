# useEntityDialog()

```ts
function useEntityDialog<TResult, TData>(options?): UseEntityDialogResult<TResult, TData>;
```

Defined in: [packages/rxdb-model-react/src/headless.ts:138](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-react/src/headless.ts#L138)

React dialog lifecycle binding.

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

[`UseEntityDialogResult`](../interfaces/UseEntityDialogResult.md)&lt;`TResult`, `TData`&gt;
