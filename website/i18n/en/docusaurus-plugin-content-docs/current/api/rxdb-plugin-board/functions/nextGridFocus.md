# nextGridFocus()

```ts
function nextGridFocus(columns, currentId, direction): `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: [packages/rxdb-plugin-board/src/keyboard.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/keyboard.ts#L47)

Focus movement target: up/down moves within the same column and stops at the edges; left/right jumps to the same row of the nearest non-empty column (short columns take the last card).

## Parameters

| Parameter   | Type                                                             |
| ----------- | ---------------------------------------------------------------- |
| `columns`   | readonly [`BoardGridColumn`](../interfaces/BoardGridColumn.md)[] |
| `currentId` | `` `${string}-${string}-${string}-${string}-${string}` ``        |
| `direction` | [`BoardGridDirection`](../type-aliases/BoardGridDirection.md)    |

## Returns

`` `${string}-${string}-${string}-${string}-${string}` `` \| `null`

The target card id; `null` when there is no target (edge or unknown card)
