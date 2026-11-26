# useBoard()

```ts
function useBoard(rxdb, options?): UseBoardReturn;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L222)

Board domain bridge: React state + action set. All subscriptions are released automatically on unmount.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) | Connected board RxDB instance (entities include the five entities in the board namespace; requires the history plugin) |
| `options?` | [`UseBoardOptions`](../interfaces/UseBoardOptions.md) | Local storage (defaults to localStorage) |

## Returns

[`UseBoardReturn`](../interfaces/UseBoardReturn.md)

## Remarks

Domain service construction has no side effects and is created per `rxdb` instance during render: the `actions` returned in the first frame is already the complete action set (child component effects run before this hook's effect and can call them directly), symmetric with Angular's constructor-time and Vue's setup-time readiness. Subscriptions are only established in effects; the search source is rebuilt when the host-injected upstream changes (the search plugin may be installed after the board).
