# useFindByCursor()

```ts
function useFindByCursor<T>(EntityType, options): RxDBResource<InstanceType<T>[]>;
```

Defined in: [rxdb-react/src/hooks.ts:235](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/hooks.ts#L235)

Finds entities using cursor pagination.

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter    | Type                                                                                                                                                       | Description                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `EntityType` | `T`                                                                                                                                                        | Entity type.                                                                   |
| `options`    | [`UseOptions`](../type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findByCursorOptions"`&gt;&gt; | `findByCursor` query options; `after` / `before` may use legal entity cursors. |

## Returns

[`RxDBResource`](../interfaces/RxDBResource.md)&lt;`InstanceType`&lt;`T`&gt;[]&gt;

A query resource of the current page's entity array.
