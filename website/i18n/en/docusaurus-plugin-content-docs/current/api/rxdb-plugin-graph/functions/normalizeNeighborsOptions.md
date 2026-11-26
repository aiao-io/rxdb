# normalizeNeighborsOptions()

```ts
function normalizeNeighborsOptions<T, U, V>(options, preserveZeroLevel?): FindNeighborsOptions<T, U, V>;
```

Defined in: [rxdb-plugin-graph/src/utils.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/utils.ts#L41)

Normalizes neighbor query options

## Type Parameters

| Type Parameter                                                                                    | Default type                                             |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) | -                                                        |
| <a id="type-parameter-u"></a> `U`                                                                 | [`GraphWhere`](../type-aliases/GraphWhere.md)&lt;`T`&gt; |
| <a id="type-parameter-v"></a> `V` _extends_ `object`                                              | `object`                                                 |

## Parameters

| Parameter            | Type                                                                                 | Default value |
| -------------------- | ------------------------------------------------------------------------------------ | ------------- |
| `options`            | [`FindNeighborsOptions`](../interfaces/FindNeighborsOptions.md)&lt;`T`, `U`, `V`&gt; | `undefined`   |
| `preserveZeroLevel?` | `boolean`                                                                            | `false`       |

## Returns

[`FindNeighborsOptions`](../interfaces/FindNeighborsOptions.md)&lt;`T`, `U`, `V`&gt;
