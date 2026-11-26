# injectEntityForm()

```ts
function injectEntityForm(options): InjectEntityFormReturn;
```

Defined in: [packages/rxdb-model-angular/src/headless/bindings.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/headless/bindings.ts#L76)

Injects a reactive entity form controller; subscriptions are released automatically when the host is destroyed.

## Parameters

| Parameter | Type                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options` | [`AngularHeadlessOptions`](../type-aliases/AngularHeadlessOptions.md)&lt;[`EntityFormControllerOptions`](../interfaces/EntityFormControllerOptions.md)&gt; |

## Returns

[`InjectEntityFormReturn`](../interfaces/InjectEntityFormReturn.md)
