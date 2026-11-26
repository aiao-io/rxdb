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

Display name path (e.g. `Order.Created at`)

## Description

Given a field path (e.g. `orders.createdAt`), returns the full display name path (e.g. `Order.Created at`).
Traverses the tree structure, joining the displayName of each level.

## Example

```ts
const displayPath = getDisplayNamePath(tree, 'orders.createdAt');
console.log(displayPath); // 'Order.Created at'
```
