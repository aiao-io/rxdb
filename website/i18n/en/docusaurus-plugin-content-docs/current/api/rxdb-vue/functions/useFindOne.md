# useFindOne()

```ts
function useFindOne<T>(EntityType, options): RxDBResource<InstanceType<T> | undefined>;
```

Defined in: [rxdb-vue/src/hooks.ts:289](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/hooks.ts#L289)

Finds a single entity matching the condition

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | Entity class |
| `options` | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findOneOptions"`&gt;&gt; | Query options (where clause, ordering, etc.) |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;`InstanceType`&lt;`T`&gt; \| `undefined`&gt;

A reactive resource object containing the entity
