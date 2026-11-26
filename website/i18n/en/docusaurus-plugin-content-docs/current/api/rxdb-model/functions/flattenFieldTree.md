# flattenFieldTree()

```ts
function flattenFieldTree(nodes, separator?, prefix?): object[];
```

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:263](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L263)

Flattens a field tree into a list of options.

## Parameters

| Parameter    | Type                                                | Default value | Description                         |
| ------------ | --------------------------------------------------- | ------------- | ----------------------------------- |
| `nodes`      | [`FieldTreeNode`](../interfaces/FieldTreeNode.md)[] | `undefined`   | The field tree nodes                |
| `separator?` | `string`                                            | `' › '`       | The level separator (default ' › ') |
| `prefix?`    | `string`                                            | `''`          | The prefix path (used in recursion) |

## Returns

`object`[]

The flattened list of options
