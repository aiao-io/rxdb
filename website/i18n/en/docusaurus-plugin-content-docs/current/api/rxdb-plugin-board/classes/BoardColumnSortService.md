# BoardColumnSortService

Defined in: [packages/rxdb-plugin-board/src/column-sort-service.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/column-sort-service.ts#L66)

Column sorting (US-535): one-time reorder via the column menu "Sort by due date" / "Sort by title".

## Remarks

Not a persistent sort mode: tasks created afterwards still append to the column tail and dragging keeps working as usual.
The facade `Repository.reorder()` opens its own transaction and the executor's `IRepository` has no `reorder()`;
awaiting the facade inside an outer transaction would queue behind itself and hang forever — so this service uses executor transactions:
re-read the whole column → validate keys → compute the target order → generate new keys for the whole column → write only `sortOrder`.
Only the local, fully-versioned primary endpoint is supported: remote-only / QueryCache are rejected before writing
(the same criterion the engine `Repository` uses, since computing keys from a partial local sequence would diverge from the remote).

## Constructors

### Constructor

```ts
new BoardColumnSortService(
   rxdb,
   ctx,
   notifier
): BoardColumnSortService;
```

Defined in: [packages/rxdb-plugin-board/src/column-sort-service.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/column-sort-service.ts#L67)

#### Parameters

| Parameter  | Type                                                          |
| ---------- | ------------------------------------------------------------- |
| `rxdb`     | [`RxDB`](../../rxdb/classes/RxDB.md)                          |
| `ctx`      | () => [`BoardHostContext`](../interfaces/BoardHostContext.md) |
| `notifier` | [`BoardWriteNotifier`](BoardWriteNotifier.md)                 |

#### Returns

`BoardColumnSortService`

## Methods

### sortColumn() \{#sortcolumn\}

```ts
sortColumn(columnId, mode): Promise<ColumnSortResult>;
```

Defined in: [packages/rxdb-plugin-board/src/column-sort-service.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/column-sort-service.ts#L73)

#### Parameters

| Parameter  | Type                                                      |
| ---------- | --------------------------------------------------------- |
| `columnId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `mode`     | [`ColumnSortMode`](../type-aliases/ColumnSortMode.md)     |

#### Returns

`Promise`&lt;[`ColumnSortResult`](../interfaces/ColumnSortResult.md)&gt;
