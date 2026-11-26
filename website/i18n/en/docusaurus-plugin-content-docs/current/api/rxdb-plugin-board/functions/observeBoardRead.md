# observeBoardRead()

```ts
function observeBoardRead(rxdb, boardId): Observable<BoardReadState>;
```

Defined in: [packages/rxdb-plugin-board/src/board-read.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-read.ts#L113)

Observes all sub-collections of the current board; unsubscribing also cancels all in-flight sub-queries.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) | The connected board instance |
| `boardId` | `` `${string}-${string}-${string}-${string}-${string}` `` \| `null` | The current board, null when no board is selected |

## Returns

`Observable`&lt;[`BoardReadState`](../type-aliases/BoardReadState.md)&gt;

Publishes loading first, then the complete snapshot or a distinguishable failure
