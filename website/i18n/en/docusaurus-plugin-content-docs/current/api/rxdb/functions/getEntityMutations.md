# getEntityMutations()

```ts
function getEntityMutations<T>(options): RxDBMutationsMap<T>;
```

Defined in: [packages/rxdb/src/entity/entity.utils.ts:469](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.utils.ts#L469)

Gets the entity mutation map.

## Type Parameters

| Type Parameter                                                                            | Default type                                  |
| ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) | [`EntityType`](../type-aliases/EntityType.md) |

## Parameters

| Parameter | Type                                                                           |
| --------- | ------------------------------------------------------------------------------ |
| `options` | [`EntityMutationsOptions`](../interfaces/EntityMutationsOptions.md)&lt;`T`&gt; |

## Returns

[`RxDBMutationsMap`](../interfaces/RxDBMutationsMap.md)&lt;`T`&gt;
