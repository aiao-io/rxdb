# useFindByCursor()

```ts
function useFindByCursor<T>(EntityType, options): RxDBResource<InstanceType<T>[]>;
```

Defined in: [rxdb-vue/src/hooks.ts:338](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/hooks.ts#L338)

Finds entities using cursor pagination

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter    | Type                                                                                                                                                       | Description                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `EntityType` | `T`                                                                                                                                                        | Entity class                                                     |
| `options`    | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findByCursorOptions"`&gt;&gt; | Cursor pagination options (where, orderBy, limit, after, before) |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;`InstanceType`&lt;`T`&gt;[]&gt;

A reactive resource object containing the entity array
