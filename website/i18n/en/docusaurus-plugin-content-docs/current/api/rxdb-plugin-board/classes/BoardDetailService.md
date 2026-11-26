# BoardDetailService

Defined in: [packages/rxdb-plugin-board/src/detail-service.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/detail-service.ts#L52)

Detail editing service: open snapshot, one-shot save and save-as-you-edit (see file header).

## Constructors

### Constructor

```ts
new BoardDetailService(rxdb, ctx): BoardDetailService;
```

Defined in: [packages/rxdb-plugin-board/src/detail-service.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/detail-service.ts#L53)

#### Parameters

| Parameter | Type                                                          |
| --------- | ------------------------------------------------------------- |
| `rxdb`    | [`RxDB`](../../rxdb/classes/RxDB.md)                          |
| `ctx`     | () => [`BoardHostContext`](../interfaces/BoardHostContext.md) |

#### Returns

`BoardDetailService`

## Methods

### openSnapshot() \{#opensnapshot\}

```ts
openSnapshot(taskId): Promise<TaskDraftSnapshot>;
```

Defined in: [packages/rxdb-plugin-board/src/detail-service.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/detail-service.ts#L59)

Opens the detail view: reads the current state as a snapshot (holds no transaction).

#### Parameters

| Parameter | Type                                                      |
| --------- | --------------------------------------------------------- |
| `taskId`  | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`Promise`&lt;[`TaskDraftSnapshot`](../interfaces/TaskDraftSnapshot.md)&gt;

---

### saveTaskDraft() \{#savetaskdraft\}

```ts
saveTaskDraft(
   taskId,
   snapshot,
   draft
): Promise<SaveTaskDraftResult>;
```

Defined in: [packages/rxdb-plugin-board/src/detail-service.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/detail-service.ts#L85)

One save = one transaction: the field diff + the label relation diff are committed atomically; unchanged content means zero writes.

#### Parameters

| Parameter  | Type                                                      |
| ---------- | --------------------------------------------------------- |
| `taskId`   | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `snapshot` | [`TaskDraftSnapshot`](../interfaces/TaskDraftSnapshot.md) |
| `draft`    | [`TaskDraft`](../interfaces/TaskDraft.md)                 |

#### Returns

`Promise`&lt;[`SaveTaskDraftResult`](../type-aliases/SaveTaskDraftResult.md)&gt;

---

### saveTaskFields() \{#savetaskfields\}

```ts
saveTaskFields(
   taskId,
   base,
   patch
): Promise<SaveTaskDraftResult>;
```

Defined in: [packages/rxdb-plugin-board/src/detail-service.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/detail-service.ts#L187)

Save-as-you-edit (board v2 detail sidebar): commits only the fields in `patch`, one transaction per call (one undo reversal).

#### Parameters

| Parameter | Type                                                      |
| --------- | --------------------------------------------------------- |
| `taskId`  | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `base`    | [`TaskDraftSnapshot`](../interfaces/TaskDraftSnapshot.md) |
| `patch`   | [`TaskFieldPatch`](../type-aliases/TaskFieldPatch.md)     |

#### Returns

`Promise`&lt;[`SaveTaskDraftResult`](../type-aliases/SaveTaskDraftResult.md)&gt;

#### Remarks

`base` is the snapshot taken when editing of the field began. The latest state is re-read before committing:
if a field covered by `patch` has been changed through another entry, the write is rejected with zero writes
(`task_stale` / `labels_changed`); fields not covered follow the latest state, and external changes to other fields
do not count as conflicts. Validation, same-board label checks and in-transaction re-verification follow [saveTaskDraft](#savetaskdraft).
