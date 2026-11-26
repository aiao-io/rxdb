# useEntityDialogHeadless

```ts
const useEntityDialogHeadless: <TResult, TData>(options) => UseEntityDialogResult<TResult, TData> = useEntityDialog;
```

Defined in: [packages/rxdb-model-vue/src/headless.ts:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/headless.ts#L177)

Equivalent naming alias of useEntityDialogHeadless.

Vue dialog lifecycle binding.

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

[`UseEntityDialogResult`](../interfaces/UseEntityDialogResult.md)&lt;`TResult`, `TData`&gt;
