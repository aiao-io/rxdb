# buildFieldTree()

```ts
function buildFieldTree(fields, i18n?): FieldTreeNode[];
```

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L83)

Converts a flat field list into a tree structure.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fields` | [`FieldMetadata`](../interfaces/FieldMetadata.md)[] | The flat field metadata list |
| `i18n?` | [`ModelI18n`](../interfaces/ModelI18n.md) | - |

## Returns

[`FieldTreeNode`](../interfaces/FieldTreeNode.md)[]

Tree-structured field nodes

## Description

Converts a flat path like `orders.items.productName` into a nested tree structure:
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
