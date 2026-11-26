# msUntilNextLocalMidnight()

```ts
function msUntilNextLocalMidnight(now): number;
```

Defined in: [packages/rxdb-plugin-board/src/due-status.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/due-status.ts#L36)

Milliseconds until the next local midnight, at least 1 second (for recomputing derived state across midnight).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `now` | `Date` |

## Returns

`number`
