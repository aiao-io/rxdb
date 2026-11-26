# getDisplayNamePath()

```ts
function getDisplayNamePath(tree, value): string;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:135

Gets the full displayName path

## Parameters

| Parameter | Type                                                | Description                          |
| --------- | --------------------------------------------------- | ------------------------------------ |
| `tree`    | [`FieldTreeNode`](../interfaces/FieldTreeNode.md)[] | Field tree                           |
| `value`   | `string`                                            | Field path (e.g. `orders.createdAt`) |

## Returns

`string`

Display name path (e.g. `Orders.Created at`)

## Description

Given a field path (e.g. `orders.createdAt`), returns the full display name path (e.g. `Orders.Created at`).
Joins the displayName of each level by walking the tree structure.

## Example

```ts
const displayPath = getDisplayNamePath(tree, 'orders.createdAt');
console.log(displayPath); // 'Orders.Created at'
```
