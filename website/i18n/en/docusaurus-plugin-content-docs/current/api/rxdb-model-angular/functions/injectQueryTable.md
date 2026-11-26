# injectQueryTable()

```ts
function injectQueryTable<T>(options?): InjectQueryTableReturn<T>;
```

Defined in: [packages/rxdb-model-angular/src/headless/bindings.ts:193](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/headless/bindings.ts#L193)

Injects a reactive query table controller; the input sync rules are the same as for `injectEntityList`.

## Type Parameters

| Type Parameter                                                                                    | Default type                                          |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Parameters

| Parameter  | Type                                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options?` | [`AngularHeadlessOptions`](../type-aliases/AngularHeadlessOptions.md)&lt;[`QueryTableControllerOptions`](../interfaces/QueryTableControllerOptions.md)&lt;`T`&gt;&gt; |

## Returns

[`InjectQueryTableReturn`](../interfaces/InjectQueryTableReturn.md)&lt;`T`&gt;
