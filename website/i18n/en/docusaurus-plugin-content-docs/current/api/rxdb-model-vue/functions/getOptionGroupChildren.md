# getOptionGroupChildren()

```ts
function getOptionGroupChildren(maxDepth?): string[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/field-tree.d.ts:117

Gets the optionGroupChildren config for CascadeSelect

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `maxDepth?` | `number` | Maximum depth, default 10 |

## Returns

`string`[]

Array of children property names

## Description

CascadeSelect needs to know the child node property name of each level.
Since we uniformly use 'children', it returns repeated ['children', 'children', ...]
The depth is determined by the maximum nesting level.
