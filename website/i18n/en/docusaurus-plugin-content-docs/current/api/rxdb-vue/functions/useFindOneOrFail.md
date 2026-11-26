# useFindOneOrFail()

```ts
function useFindOneOrFail<T>(EntityType, options): RxDBResource<InstanceType<T> | undefined>;
```

Defined in: [rxdb-vue/src/hooks.ts:307](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/hooks.ts#L307)

Finds a single entity, throws if not found

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter    | Type                                                                                                                                                        | Description   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `EntityType` | `T`                                                                                                                                                         | Entity class  |
| `options`    | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findOneOrFailOptions"`&gt;&gt; | Query options |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;`InstanceType`&lt;`T`&gt; \| `undefined`&gt;

A reactive resource object containing the entity
