# useBoard()

```ts
function useBoard(rxdb, options?): UseBoardReturn;
```

Defined in: [packages/rxdb-plugin-board-angular/src/use-board.ts:175](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-angular/src/use-board.ts#L175)

Board domain bridge: data signals + action set. Must be called in an injection context (it calls `inject(DestroyRef)` internally).

## Parameters

| Parameter  | Type                                                  | Description                                                                               |
| ---------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `rxdb`     | [`RxDB`](../../rxdb/classes/RxDB.md)                  | Connected board RxDB instance (entities include the five entities of the board namespace) |
| `options?` | [`UseBoardOptions`](../interfaces/UseBoardOptions.md) | Local record storage (localStorage by default)                                            |

## Returns

[`UseBoardReturn`](../interfaces/UseBoardReturn.md)
