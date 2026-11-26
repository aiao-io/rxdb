# useFindAncestors()

```ts
function useFindAncestors<T>(EntityType, options): RxDBResource<InstanceType<T>[]>;
```

Defined in: [use-tree.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree-vue/src/use-tree.ts#L59)

Finds all ancestor entities under the tree structure

## Type Parameters

| Type Parameter                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`TreeEntityType`](../../rxdb-plugin-tree/type-aliases/TreeEntityType.md) |

## Parameters

| Parameter    | Type                                                                                                                                                                    | Description            |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `EntityType` | `T`                                                                                                                                                                     | The entity class       |
| `options`    | [`UseOptions`](../../rxdb-vue/type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findAncestorsOptions"`&gt;&gt; | The tree query options |

## Returns

[`RxDBResource`](../../rxdb-vue/interfaces/RxDBResource.md)&lt;`InstanceType`&lt;`T`&gt;[]&gt;

A reactive resource object containing the ancestor entities
