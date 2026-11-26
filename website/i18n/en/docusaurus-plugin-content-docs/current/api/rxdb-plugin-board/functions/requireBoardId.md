# requireBoardId()

```ts
function requireBoardId(ctx): `${string}-${string}-${string}-${string}-${string}`;
```

Defined in: [packages/rxdb-plugin-board/src/host-context.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/host-context.ts#L31)

Gets the current board id: throws `board_not_found` when there is no board.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | [`BoardHostContext`](../interfaces/BoardHostContext.md) |

## Returns

`` `${string}-${string}-${string}-${string}-${string}` ``
