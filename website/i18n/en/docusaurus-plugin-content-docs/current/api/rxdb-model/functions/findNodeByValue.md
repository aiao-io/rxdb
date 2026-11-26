# findNodeByValue()

```ts
function findNodeByValue(nodes, value): FieldTreeNode | undefined;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:303](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L303)

Finds a node in the tree

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `nodes` | [`FieldTreeNode`](../interfaces/FieldTreeNode.md)[] | Tree node list |
| `value` | `string` | Value to find (the full path) |

## Returns

[`FieldTreeNode`](../interfaces/FieldTreeNode.md) \| `undefined`

The found node or undefined

## Example

```ts
const node = findNodeByValue(tree, 'orders.items.productName');
console.log(node?.displayName); // 'Product name'
```
