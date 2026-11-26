# useFindAncestors()

```ts
function useFindAncestors<T>(EntityType, options): RxDBResource<InstanceType<T>[]>;
```

Defined in: [use-tree.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree-react/src/use-tree.ts#L59)

Finds all ancestors of a tree entity.

## Type Parameters

| Type Parameter                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`TreeEntityType`](../../rxdb-plugin-tree/type-aliases/TreeEntityType.md) |

## Parameters

| Parameter    | Type                                                                                                                                                                      | Description                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `EntityType` | `T`                                                                                                                                                                       | The tree entity type.                            |
| `options`    | [`UseOptions`](../../rxdb-react/type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findAncestorsOptions"`&gt;&gt; | The tree query options or an idempotent factory. |

## Returns

[`RxDBResource`](../../rxdb-react/interfaces/RxDBResource.md)&lt;`InstanceType`&lt;`T`&gt;[]&gt;

The query resource of the ancestor entity array.
