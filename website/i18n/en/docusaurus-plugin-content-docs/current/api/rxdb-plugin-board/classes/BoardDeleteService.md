# BoardDeleteService

Defined in: [packages/rxdb-plugin-board/src/delete-service.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/delete-service.ts#L58)

Delete service: plans outside the transaction, re-verifies the sets inside the transaction after confirmation, then deletes children before parents (see file header).

## Constructors

### Constructor

```ts
new BoardDeleteService(rxdb, ctx): BoardDeleteService;
```

Defined in: [packages/rxdb-plugin-board/src/delete-service.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/delete-service.ts#L59)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) |
| `ctx` | () => [`BoardHostContext`](../interfaces/BoardHostContext.md) |

#### Returns

`BoardDeleteService`

## Methods

### executeDelete() \{#executedelete\}

```ts
executeDelete(plan): Promise<void>;
```

Defined in: [packages/rxdb-plugin-board/src/delete-service.ts:166](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/delete-service.ts#L166)

Re-verifies inside the transaction and executes the deletion; exits with zero writes when the sets no longer match the plan (`confirm_stale`).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `plan` | [`DeletePlan`](../type-aliases/DeletePlan.md) |

#### Returns

`Promise`&lt;`void`&gt;

***

### planBoardDelete() \{#planboarddelete\}

```ts
planBoardDelete(boardId): Promise<BoardDeletePlan>;
```

Defined in: [packages/rxdb-plugin-board/src/delete-service.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/delete-service.ts#L121)

Board deletion plan (read outside the transaction).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `boardId` | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`Promise`&lt;[`BoardDeletePlan`](../interfaces/BoardDeletePlan.md)&gt;

***

### planColumnDelete() \{#plancolumndelete\}

```ts
planColumnDelete(columnId): Promise<ColumnDeletePlan>;
```

Defined in: [packages/rxdb-plugin-board/src/delete-service.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/delete-service.ts#L90)

Column deletion plan (read outside the transaction).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `columnId` | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`Promise`&lt;[`ColumnDeletePlan`](../interfaces/ColumnDeletePlan.md)&gt;

***

### planTaskDelete() \{#plantaskdelete\}

```ts
planTaskDelete(taskId): Promise<TaskDeletePlan>;
```

Defined in: [packages/rxdb-plugin-board/src/delete-service.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/delete-service.ts#L65)

Task deletion plan (read outside the transaction, holds no transaction).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `taskId` | `` `${string}-${string}-${string}-${string}-${string}` `` |

#### Returns

`Promise`&lt;[`TaskDeletePlan`](../interfaces/TaskDeletePlan.md)&gt;
