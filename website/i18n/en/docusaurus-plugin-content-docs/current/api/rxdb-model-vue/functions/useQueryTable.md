# useQueryTable()

```ts
function useQueryTable<T>(options?): UseQueryTableResult<T>;
```

Defined in: [packages/rxdb-model-vue/src/headless.ts:185](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-vue/src/headless.ts#L185)

Vue query table state binding; the input sync rules are the same as `useEntityList`.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityInstance`](../type-aliases/EntityInstance.md) | [`EntityInstance`](../type-aliases/EntityInstance.md) |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`QueryTableControllerOptions`](../interfaces/QueryTableControllerOptions.md)&lt;`T`&gt; |

## Returns

[`UseQueryTableResult`](../interfaces/UseQueryTableResult.md)&lt;`T`&gt;
