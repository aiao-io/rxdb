# normalizePathsOptions()

```ts
function normalizePathsOptions<T, U, V>(options): FindPathsOptions<T, U, V>;
```

Defined in: [rxdb-plugin-graph/src/utils.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/utils.ts#L58)

Normalizes path query options

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) | - |
| <a id="type-parameter-u"></a> `U` | [`GraphWhere`](../type-aliases/GraphWhere.md)&lt;`T`&gt; |
| <a id="type-parameter-v"></a> `V` *extends* `object` | `object` |

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`FindPathsOptions`](../interfaces/FindPathsOptions.md)&lt;`T`, `U`, `V`&gt; |

## Returns

[`FindPathsOptions`](../interfaces/FindPathsOptions.md)&lt;`T`, `U`, `V`&gt;
