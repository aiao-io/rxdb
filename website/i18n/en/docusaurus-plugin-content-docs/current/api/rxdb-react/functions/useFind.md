# useFind()

```ts
function useFind<T>(EntityType, options): RxDBResource<InstanceType<T>[]>;
```

Defined in: [rxdb-react/src/hooks.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/hooks.ts#L222)

Finds multiple matching entities.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | Entity type. |
| `options` | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findOptions"`&gt;&gt; | `find` query options or an idempotent factory. |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;`InstanceType`&lt;`T`&gt;[]&gt;

A query resource with an empty array as the initial value.
