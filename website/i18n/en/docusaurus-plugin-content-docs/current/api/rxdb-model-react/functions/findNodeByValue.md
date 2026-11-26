# findNodeByValue()

```ts
function findNodeByValue(nodes, value): FieldTreeNode | undefined;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:88

Finds a node in the tree

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `nodes` | [`FieldTreeNode`](../interfaces/FieldTreeNode.md)[] | List of tree nodes |
| `value` | `string` | The value to look up (full path) |

## Returns

[`FieldTreeNode`](../interfaces/FieldTreeNode.md) \| `undefined`

The found node or undefined

## Example

```ts
const node = findNodeByValue(tree, 'orders.items.productName');
console.log(node?.displayName); // 'Product name'
```
