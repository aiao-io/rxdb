# useCount()

```ts
function useCount<T>(EntityType, options): RxDBResource<number>;
```

Defined in: [rxdb-vue/src/hooks.ts:369](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/hooks.ts#L369)

Counts the entities matching the condition

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter    | Type                                                                                                                                                | Description   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `EntityType` | `T`                                                                                                                                                 | Entity class  |
| `options`    | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"countOptions"`&gt;&gt; | Query options |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;`number`&gt;

A reactive resource object containing the count
