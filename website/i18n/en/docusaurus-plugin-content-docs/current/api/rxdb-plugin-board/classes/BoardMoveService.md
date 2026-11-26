# BoardMoveService

Defined in: [packages/rxdb-plugin-board/src/move-service.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/move-service.ts#L21)

Move service (US-535): cross-column moves / reordering within a column / dragging columns.

## Remarks

The domain service first validates that the source and target columns exist and belong to the same board, then uses single-card `Repository.reorder()` to write only
`columnId` (storage column `column_id`) and `sortOrder` in one transaction; empty columns use
a `{ group: { columnId } }` target. Persistence failures (`staleTarget` / `notFound` /
`PermissionDeniedError` etc.) publish the failure reason via [BoardWriteNotifier](BoardWriteNotifier.md) and require
re-querying committed data, and are re-thrown unchanged — the UI restores its display based on that, with no silent retry.

## Constructors

### Constructor

```ts
new BoardMoveService(
   rxdb, 
   ctx, 
   notifier
): BoardMoveService;
```

Defined in: [packages/rxdb-plugin-board/src/move-service.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/move-service.ts#L22)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) |
| `ctx` | () => [`BoardHostContext`](../interfaces/BoardHostContext.md) |
| `notifier` | [`BoardWriteNotifier`](BoardWriteNotifier.md) |

#### Returns

`BoardMoveService`

## Methods

### moveColumn() \{#movecolumn\}

```ts
moveColumn(columnId, target): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board/src/move-service.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/move-service.ts#L54)

Drag column: reorders columns within the board (`boardId` grouped ordering domain).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `columnId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `target` | \{ `nextId`: `` `${string}-${string}-${string}-${string}-${string}` `` \| `null`; `prevId`: `` `${string}-${string}-${string}-${string}-${string}` `` \| `null`; \} |
| `target.nextId` | `` `${string}-${string}-${string}-${string}-${string}` `` \| `null` |
| `target.prevId` | `` `${string}-${string}-${string}-${string}-${string}` `` \| `null` |

#### Returns

`Promise`&lt;`void`&gt;

***

### moveTask() \{#movetask\}

```ts
moveTask(taskId, target): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board/src/move-service.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/move-service.ts#L29)

Single-card move: the target comes from the same conversion table as [resolveCardDrop](../functions/resolveCardDrop.md).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `taskId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `target` | [`CardDropTarget`](../type-aliases/CardDropTarget.md) |

#### Returns

`Promise`&lt;`void`&gt;
