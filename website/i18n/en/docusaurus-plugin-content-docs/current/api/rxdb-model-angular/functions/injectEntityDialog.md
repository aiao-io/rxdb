# injectEntityDialog()

```ts
function injectEntityDialog<TResult, TData>(options?): InjectEntityDialogReturn<TResult, TData>;
```

Defined in: [packages/rxdb-model-angular/src/headless/bindings.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/headless/bindings.ts#L174)

Injects a reactive dialog lifecycle controller.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-tresult"></a> `TResult` | `unknown` |
| <a id="type-parameter-tdata"></a> `TData` | `unknown` |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`AngularHeadlessOptions`](../type-aliases/AngularHeadlessOptions.md)&lt;[`EntityDialogControllerOptions`](../interfaces/EntityDialogControllerOptions.md)&lt;`TData`&gt;&gt; |

## Returns

[`InjectEntityDialogReturn`](../interfaces/InjectEntityDialogReturn.md)&lt;`TResult`, `TData`&gt;
