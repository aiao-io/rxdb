# flattenFieldTree()

```ts
function flattenFieldTree(nodes, separator?, prefix?): object[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:71

Flattens the field tree into an option list

## Parameters

| Parameter    | Type                                                | Description                         |
| ------------ | --------------------------------------------------- | ----------------------------------- |
| `nodes`      | [`FieldTreeNode`](../interfaces/FieldTreeNode.md)[] | The field tree nodes                |
| `separator?` | `string`                                            | The level separator (default ' › ') |
| `prefix?`    | `string`                                            | The prefix path (for recursion)     |

## Returns

`object`[]

The flattened option list
