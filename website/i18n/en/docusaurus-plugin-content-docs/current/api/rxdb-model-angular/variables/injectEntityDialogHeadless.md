# injectEntityDialogHeadless

```ts
const injectEntityDialogHeadless: <TResult, TData>(options) => InjectEntityDialogReturn<TResult, TData> =
  injectEntityDialog;
```

Defined in: [packages/rxdb-model-angular/src/headless/bindings.ts:184](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/headless/bindings.ts#L184)

Equivalent naming alias of injectEntityDialogHeadless.

Injects a reactive dialog lifecycle controller.

## Type Parameters

| Type Parameter                                      | Default type |
| --------------------------------------------------- | ------------ |
| <a id="type-parameter-__typetresult"></a> `TResult` | `unknown`    |
| <a id="type-parameter-__typetdata"></a> `TData`     | `unknown`    |

## Parameters

| Parameter  | Type                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options?` | [`AngularHeadlessOptions`](../type-aliases/AngularHeadlessOptions.md)&lt;[`EntityDialogControllerOptions`](../interfaces/EntityDialogControllerOptions.md)&lt;`TData`&gt;&gt; |

## Returns

[`InjectEntityDialogReturn`](../interfaces/InjectEntityDialogReturn.md)&lt;`TResult`, `TData`&gt;
