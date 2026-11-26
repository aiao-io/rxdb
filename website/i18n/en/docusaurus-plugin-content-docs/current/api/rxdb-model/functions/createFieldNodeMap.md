# createFieldNodeMap()

```ts
function createFieldNodeMap(tree): Map<string, FieldTreeNode>;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:332](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L332)

Creates the field-name-to-node mapping

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `tree` | [`FieldTreeNode`](../interfaces/FieldTreeNode.md)[] | Field tree |

## Returns

`Map`&lt;`string`, [`FieldTreeNode`](../interfaces/FieldTreeNode.md)&gt;

Field-name-to-node mapping

## Description

Recursively walks the tree structure, creating a Map for fast node lookup.
More efficient than direct recursion for scenarios requiring frequent lookups.

## Example

```ts
const nodeMap = createFieldNodeMap(tree);
const node = nodeMap.get('orders.amount');
```
