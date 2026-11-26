# useCountDescendants()

```ts
function useCountDescendants<T>(EntityType, options): RxDBResource<number>;
```

Defined in: [use-tree.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree-vue/src/use-tree.ts#L41)

Counts the descendant entities under the tree structure

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`TreeEntityType`](../../rxdb-plugin-tree/type-aliases/TreeEntityType.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | The entity class |
| `options` | [`UseOptions`](../../rxdb-vue/type-aliases/UseOptions.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"countDescendantsOptions"`&gt;&gt; | The tree query options |

## Returns

[`RxDBResource`](../../rxdb-vue/interfaces/RxDBResource.md)&lt;`number`&gt;

A reactive resource object containing the count
