# injectQueryTableHeadless

```ts
const injectQueryTableHeadless: <T>(options) => InjectQueryTableReturn<T> = injectQueryTable;
```

Defined in: [packages/rxdb-model-angular/src/headless/bindings.ts:199](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/headless/bindings.ts#L199)

Equivalent naming alias of injectQueryTableHeadless.

Injects a reactive query table controller; input sync rules are the same as `injectEntityList`.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-__typet"></a> `T` *extends* [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`AngularHeadlessOptions`](../type-aliases/AngularHeadlessOptions.md)&lt;[`QueryTableControllerOptions`](../interfaces/QueryTableControllerOptions.md)&lt;`T`&gt;&gt; |

## Returns

[`InjectQueryTableReturn`](../interfaces/InjectQueryTableReturn.md)&lt;`T`&gt;
