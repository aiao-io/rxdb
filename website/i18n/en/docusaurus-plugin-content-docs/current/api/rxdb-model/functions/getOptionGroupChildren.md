# getOptionGroupChildren()

```ts
function getOptionGroupChildren(maxDepth?): string[];
```

Defined in: [packages/rxdb-model/src/query-builder/utils/field-tree.ts:359](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/field-tree.ts#L359)

Gets the optionGroupChildren configuration for CascadeSelect.

## Parameters

| Parameter   | Type     | Default value | Description                   |
| ----------- | -------- | ------------- | ----------------------------- |
| `maxDepth?` | `number` | `10`          | The maximum depth, default 10 |

## Returns

`string`[]

An array of children property names

## Description

CascadeSelect needs to know the child-node property name at each level.
Since we uniformly use 'children', it returns a repeated ['children', 'children', ...]
with the depth determined by the maximum nesting level.
