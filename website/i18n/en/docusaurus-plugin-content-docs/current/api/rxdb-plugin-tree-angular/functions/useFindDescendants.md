# useFindDescendants()

```ts
function useFindDescendants<T>(EntityType, options): RxDBResource<InstanceType<T>[]>;
```

Defined in: [use-tree.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree-angular/src/use-tree.ts#L23)

Finds all descendant entities in the tree structure

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`TreeEntityType`](../../rxdb-plugin-tree/type-aliases/TreeEntityType.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | The entity class |
| `options` | `UseOptions`&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findDescendantsOptions"`&gt;&gt; | The tree query parameters (entityId, depth, etc.) |

## Returns

`RxDBResource`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

Returns a resource signal containing the descendant entities
