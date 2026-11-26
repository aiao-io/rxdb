# getDisplayNamePath()

```ts
function getDisplayNamePath(tree, value): string;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:380](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L380)

Gets the full displayName path

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `tree` | [`FieldTreeNode`](../interfaces/FieldTreeNode.md)[] | Field tree |
| `value` | `string` | Field path (e.g. `orders.createdAt`) |

## Returns

`string`

The display name path (e.g. `Order.Created at`)

## Description

Given a field path (e.g. `orders.createdAt`), returns the full display name path (e.g. `Order.Created at`).
Concatenates the displayName of each level by walking the tree structure.

## Example

```ts
const displayPath = getDisplayNamePath(tree, 'orders.createdAt');
console.log(displayPath); // 'Order.Created at'
```
