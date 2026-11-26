# flattenFieldTree()

```ts
function flattenFieldTree(nodes, separator?, prefix?): object[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:71

Flattens the field tree into an option list

## Parameters

| Parameter    | Type                                                | Description                     |
| ------------ | --------------------------------------------------- | ------------------------------- |
| `nodes`      | [`FieldTreeNode`](../interfaces/FieldTreeNode.md)[] | Field tree nodes                |
| `separator?` | `string`                                            | Level separator (default ' › ') |
| `prefix?`    | `string`                                            | Path prefix (used in recursion) |

## Returns

`object`[]

The flattened option list
