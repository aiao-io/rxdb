# useBoard()

```ts
function useBoard(rxdb, options?): UseBoardReturn;
```

Defined in: [packages/rxdb-plugin-board-vue/src/use-board.ts:163](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-vue/src/use-board.ts#L163)

Board domain bridge: Vue refs + action set. Subscriptions are cleaned up automatically when the component unmounts (or the scope is released).

## Parameters

| Parameter  | Type                                                  | Description                                                                                                            |
| ---------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `rxdb`     | [`RxDB`](../../rxdb/classes/RxDB.md)                  | Connected board RxDB instance (entities include the five entities in the board namespace; requires the history plugin) |
| `options?` | [`UseBoardOptions`](../interfaces/UseBoardOptions.md) | Local storage (defaults to localStorage)                                                                               |

## Returns

[`UseBoardReturn`](../interfaces/UseBoardReturn.md)

## Throws

Error when not called inside `setup()` or an active `effectScope()` (subscriptions and the notifier would have nobody to release them).
