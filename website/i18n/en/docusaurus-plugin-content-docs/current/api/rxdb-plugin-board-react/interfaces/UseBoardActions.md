# UseBoardActions

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L119)

Board domain actions: each delegates to a core package domain service; the write gate during restore and validation are re-checked in the service layer.

## Methods

### createBoard() \{#createboard\}

```ts
createBoard(input): Promise<Board>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:120](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L120)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | \{ `description?`: `string`; `title`: `string`; \} |
| `input.description?` | `string` |
| `input.title` | `string` |

#### Returns

`Promise`&lt;[`Board`](Board.md)&gt;

***

### createColumn() \{#createcolumn\}

```ts
createColumn(input): Promise<Column>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L121)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | \{ `title`: `string`; \} |
| `input.title` | `string` |

#### Returns

`Promise`&lt;[`Column`](Column.md)&gt;

***

### createLabel() \{#createlabel\}

```ts
createLabel(input): Promise<BoardLabel>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:137](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L137)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | \{ `color`: `string`; `name`: `string`; \} |
| `input.color` | `string` |
| `input.name` | `string` |

#### Returns

`Promise`&lt;[`BoardLabel`](BoardLabel.md)&gt;

***

### createTask() \{#createtask\}

```ts
createTask(input): Promise<Task>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L122)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | \{ `columnId`: `` `${string}-${string}-${string}-${string}-${string}` ``; `title`: `string`; \} |
| `input.columnId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `input.title` | `string` |

#### Returns

`Promise`&lt;[`Task`](Task.md)&gt;

***

### executeDelete() \{#executedelete\}

```ts
executeDelete(plan): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:133](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L133)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `plan` | [`DeletePlan`](../type-aliases/DeletePlan.md) |

#### Returns

`Promise`&lt;`void`&gt;

***

### executeLabelDelete() \{#executelabeldelete\}

```ts
executeLabelDelete(plan): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L141)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `plan` | [`LabelDeletePlan`](LabelDeletePlan.md) |

#### Returns

`Promise`&lt;`void`&gt;

***

### moveColumn() \{#movecolumn\}

```ts
moveColumn(columnId, target): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:135](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L135)

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

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L134)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `taskId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `target` | [`CardDropTarget`](../type-aliases/CardDropTarget.md) |

#### Returns

`Promise`&lt;`void`&gt;

***

### openSnapshot() \{#opensnapshot\}

```ts
openSnapshot(taskId): Promise<TaskDraftSnapshot>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:126](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L126)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `taskId` | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`Promise`&lt;[`TaskDraftSnapshot`](TaskDraftSnapshot.md)&gt;

***

### planBoardDelete() \{#planboarddelete\}

```ts
planBoardDelete(boardId): Promise<BoardDeletePlan>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L132)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `boardId` | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`Promise`&lt;[`BoardDeletePlan`](../../rxdb-plugin-board/interfaces/BoardDeletePlan.md)&gt;

***

### planColumnDelete() \{#plancolumndelete\}

```ts
planColumnDelete(columnId): Promise<ColumnDeletePlan>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L131)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `columnId` | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`Promise`&lt;[`ColumnDeletePlan`](../../rxdb-plugin-board/interfaces/ColumnDeletePlan.md)&gt;

***

### planLabelDelete() \{#planlabeldelete\}

```ts
planLabelDelete(labelId): Promise<LabelDeletePlan>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:140](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L140)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `labelId` | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`Promise`&lt;[`LabelDeletePlan`](LabelDeletePlan.md)&gt;

***

### planTaskDelete() \{#plantaskdelete\}

```ts
planTaskDelete(taskId): Promise<TaskDeletePlan>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:130](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L130)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `taskId` | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`Promise`&lt;[`TaskDeletePlan`](../../rxdb-plugin-board/interfaces/TaskDeletePlan.md)&gt;

***

### recolorLabel() \{#recolorlabel\}

```ts
recolorLabel(labelId, color): Promise<BoardLabel>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L139)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `labelId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `color` | `string` |

#### Returns

`Promise`&lt;[`BoardLabel`](BoardLabel.md)&gt;

***

### redo() \{#redo\}

```ts
redo(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L143)

#### Returns

`Promise`&lt;`void`&gt;

***

### renameLabel() \{#renamelabel\}

```ts
renameLabel(labelId, name): Promise<BoardLabel>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:138](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L138)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `labelId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `name` | `string` |

#### Returns

`Promise`&lt;[`BoardLabel`](BoardLabel.md)&gt;

***

### saveTaskDraft() \{#savetaskdraft\}

```ts
saveTaskDraft(
   taskId, 
   snapshot, 
   draft
): Promise<SaveTaskDraftResult>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L127)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `taskId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `snapshot` | [`TaskDraftSnapshot`](TaskDraftSnapshot.md) |
| `draft` | [`TaskDraft`](TaskDraft.md) |

#### Returns

`Promise`&lt;[`SaveTaskDraftResult`](../type-aliases/SaveTaskDraftResult.md)&gt;

***

### saveTaskFields() \{#savetaskfields\}

```ts
saveTaskFields(
   taskId, 
   base, 
   patch
): Promise<SaveTaskDraftResult>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L129)

Save-as-you-edit (board v2 detail sidebar): only the fields in the patch are committed, one transaction per call (one undo step).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `taskId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `base` | [`TaskDraftSnapshot`](TaskDraftSnapshot.md) |
| `patch` | [`TaskFieldPatch`](../../rxdb-plugin-board/type-aliases/TaskFieldPatch.md) |

#### Returns

`Promise`&lt;[`SaveTaskDraftResult`](../type-aliases/SaveTaskDraftResult.md)&gt;

***

### sortColumn() \{#sortcolumn\}

```ts
sortColumn(columnId, mode): Promise<{
  written: boolean;
}>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L136)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `columnId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `mode` | [`ColumnSortMode`](../type-aliases/ColumnSortMode.md) |

#### Returns

`Promise`&lt;\{
  `written`: `boolean`;
\}&gt;

***

### undo() \{#undo\}

```ts
undo(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:142](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L142)

#### Returns

`Promise`&lt;`void`&gt;

***

### updateBoard() \{#updateboard\}

```ts
updateBoard(boardId, patch): Promise<Board>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L123)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `boardId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `patch` | \{ `description?`: `string`; `title?`: `string`; \} |
| `patch.description?` | `string` |
| `patch.title?` | `string` |

#### Returns

`Promise`&lt;[`Board`](Board.md)&gt;

***

### updateColumn() \{#updatecolumn\}

```ts
updateColumn(columnId, patch): Promise<Column>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L124)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `columnId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `patch` | \{ `title`: `string`; \} |
| `patch.title` | `string` |

#### Returns

`Promise`&lt;[`Column`](Column.md)&gt;

***

### updateTaskTitle() \{#updatetasktitle\}

```ts
updateTaskTitle(taskId, title): Promise<Task>;
```

Defined in: [packages/rxdb-plugin-board-react/src/use-board.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board-react/src/use-board.ts#L125)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `taskId` | `` `${string}-${string}-${string}-${string}-${string}` `` |
| `title` | `string` |

#### Returns

`Promise`&lt;[`Task`](Task.md)&gt;
