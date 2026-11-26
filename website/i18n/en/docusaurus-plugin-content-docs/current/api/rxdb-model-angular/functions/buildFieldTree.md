# buildFieldTree()

```ts
function buildFieldTree(fields, i18n?): FieldTreeNode[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:62

Converts a flat field list into a tree structure.

## Parameters

| Parameter | Type                                                | Description                  |
| --------- | --------------------------------------------------- | ---------------------------- |
| `fields`  | [`FieldMetadata`](../interfaces/FieldMetadata.md)[] | The flat field metadata list |
| `i18n?`   | [`ModelI18n`](../interfaces/ModelI18n.md)           | -                            |

## Returns

[`FieldTreeNode`](../interfaces/FieldTreeNode.md)[]

The field nodes in tree structure

## Description

Converts a flat path such as `orders.items.productName` into a nested tree structure:

```
orders
└── items
    └── productName
```

## Example

```ts
const fields = [
  { name: 'name', displayName: 'Name', type: 'string' },
  { name: 'orders', displayName: 'Orders', type: 'relation' },
  `{ name: 'orders.amount', displayName: 'Orders.Amount', type: 'number' }`
];
const tree = buildFieldTree(fields);
// tree[0] = `{ label: 'name', displayName: 'Name', ... }`
// tree[1] = `{ label: 'orders', displayName: 'Orders', children: [...] }`
```
