# getOptionGroupChildren()

```ts
function getOptionGroupChildren(maxDepth?): string[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:117

Gets the optionGroupChildren configuration for CascadeSelect

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `maxDepth?` | `number` | The maximum depth, default 10 |

## Returns

`string`[]

The array of children property names

## Description

CascadeSelect needs to know the child-node property name at each level.
Since we use 'children' uniformly, this returns the repeated ['children', 'children', ...]
with the depth determined by the maximum nesting level.
