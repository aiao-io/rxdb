# useGet()

```ts
function useGet<T>(EntityType, options): RxDBResource<InstanceType<T> | undefined>;
```

Defined in: [rxdb-react/src/hooks.ts:168](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/hooks.ts#L168)

Fetches a single entity by ID.

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter    | Type                                                                                                                                              | Description                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `EntityType` | `T`                                                                                                                                               | Entity type.                                  |
| `options`    | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"getOptions"`&gt;&gt; | `get` query options or an idempotent factory. |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;`InstanceType`&lt;`T`&gt; \| `undefined`&gt;

Query resource whose `value` is `undefined` when the entity is not found.
