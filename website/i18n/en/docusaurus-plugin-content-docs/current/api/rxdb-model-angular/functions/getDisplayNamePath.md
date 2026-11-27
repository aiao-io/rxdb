# getDisplayNamePath()

```ts
function getDisplayNamePath(tree, value): string;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:135

Gets the full displayName path

## Parameters

| Parameter | Type                                                | Description                          |
| --------- | --------------------------------------------------- | ------------------------------------ |
| `tree`    | [`FieldTreeNode`](../interfaces/FieldTreeNode.md)[] | The field tree                       |
| `value`   | `string`                                            | Field path (e.g. `orders.createdAt`) |

## Returns

`string`

The display name path (e.g. `Orders.Created at`)

## Description

Given a field path (e.g. `orders.createdAt`), returns the full display name path (e.g. `Orders.Created at`).
It walks the tree structure and joins the displayName of each level.

## Example

```ts
const displayPath = getDisplayNamePath(tree, 'orders.createdAt');
console.log(displayPath); // 'Orders.Created at'
```
