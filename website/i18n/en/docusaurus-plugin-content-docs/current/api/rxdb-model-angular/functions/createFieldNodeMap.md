# createFieldNodeMap()

```ts
function createFieldNodeMap(tree): Map<string, FieldTreeNode>;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:105

Creates a mapping from field names to nodes

## Parameters

| Parameter | Type                                                | Description    |
| --------- | --------------------------------------------------- | -------------- |
| `tree`    | [`FieldTreeNode`](../interfaces/FieldTreeNode.md)[] | The field tree |

## Returns

`Map`&lt;`string`, [`FieldTreeNode`](../interfaces/FieldTreeNode.md)&gt;

The mapping from field names to nodes

## Description

Recursively walks the tree structure to create a Map for fast node lookup.
More efficient than recursing directly for scenarios that need frequent lookups.

## Example

```ts
const nodeMap = createFieldNodeMap(tree);
const node = nodeMap.get('orders.amount');
```
