# assertTreeLevel()

```ts
function assertTreeLevel(level): number | undefined;
```

Defined in: [rxdb-plugin-tree/src/repository/tree-level.utils.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/repository/tree-level.utils.ts#L10)

Validates the tree query depth; keeps the unlimited-depth semantics when not provided.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `level` | `number` \| `undefined` | Query depth |

## Returns

`number` \| `undefined`

A non-negative safe integer; returns `undefined` when not provided

## Throws

Throws `RxDBError` when the depth is not a non-negative safe integer
