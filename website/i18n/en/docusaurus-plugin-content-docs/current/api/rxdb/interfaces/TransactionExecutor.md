# TransactionExecutor

Defined in: [packages/rxdb/src/transaction/transaction-executor.interface.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/transaction/transaction-executor.interface.ts#L43)

The scope handle of one transaction.

## Remarks

**Holding it = entitled to execute within this transaction; not holding it = must re-enqueue.**
For transaction entries and positive/negative examples see [RxDBAdapterLocalBase.transaction](../classes/RxDBAdapterLocalBase.md#transaction); a transaction callback must not await `entity.save()`.
Transaction identity is represented by **object identity**, no longer inferred from a boolean ambient state (`#transaction_lock`) on the adapter instance.

Why it exists: the old boolean ambient state could not distinguish two kinds of calls across `await` — nesting inside the then-current transaction body
(`record.save()` → `entityManager.mutations` → `adapter.mutations`) versus outside concurrent writes
(QueryCache / remote sync writing independently within the transaction window). Both enter through the same entry; treating everything as "nested"
would sweep outside writes into someone else's transaction and lose them with the ROLLBACK (`SQLC-001` / `PGL-001`),
and treating everything as "outside" would deadlock the startup flow.

See `code-reviews/transaction-executor-design.md` §4 for the design.

## Example

```ts
await adapter.transaction(async executor => {
  // Reads and writes through the executor belong to this transaction
  const repository = executor.getRepository(Todo);
  const todos = await repository.find({ where: { combinator: 'and', rules: [] } });
  await repository.update(todos[0], { done: true });
});
```

## Properties

### id \{#id\}

```ts
readonly id: string;
```

Defined in: [packages/rxdb/src/transaction/transaction-executor.interface.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/transaction/transaction-executor.interface.ts#L50)

The transaction identifier, used for logging and assertions.

#### Remarks

Do **not** use it to judge whether two executors are the same transaction — use object identity (`a === b`).

---

### state \{#state\}

```ts
readonly state: TransactionExecutorState;
```

Defined in: [packages/rxdb/src/transaction/transaction-executor.interface.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/transaction/transaction-executor.interface.ts#L53)

Lifecycle state.

---

### tableSet \{#tableset\}

```ts
readonly tableSet: WorktreeTableSet;
```

Defined in: [packages/rxdb/src/transaction/transaction-executor.interface.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/transaction/transaction-executor.interface.ts#L62)

Which business table set this transaction lands on: the one mounted by the instance that initiated it (US-314 writable checkouts)

#### Remarks

Code inside the transaction that needs to read the "current branch" uses its `heldBranchWhere`: when mounted on a writable checkout, the current branch is the branch held by that table set,
not the one active on the main checkout. [tableRef](#tableref) also uses it to assemble physical names.

## Methods

### getRepository() \{#getrepository\}

```ts
getRepository<T>(EntityType): IRepository<T>;
```

Defined in: [packages/rxdb/src/transaction/transaction-executor.interface.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/transaction/transaction-executor.interface.ts#L121)

Gets a repository within this transaction.

#### Type Parameters

| Type Parameter                                                                            |
| ----------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter    | Type | Description |
| ------------ | ---- | ----------- |
| `EntityType` | `T`  | Entity type |

#### Returns

[`IRepository`](IRepository.md)&lt;`T`&gt;

#### Remarks

All reads and writes issued by this repository belong to this transaction, **reads included** — inside a transaction body a read through plain `adapter.query()`
queues behind this very transaction, causing a hang (queue concurrency is 1).

Belonging follows the **calling entry** only, not the entity: entities read or created through this repository are no different from entities from elsewhere,
and their `entity.save()` / `entity.remove()` are always outside calls that re-enqueue behind this transaction —
awaiting them inside the transaction callback hangs (see the class-level note). To write within this transaction, use this repository's `create()` / `update()` /
`remove()`, or this executor's [saveMany](#savemany) / [removeMany](#removemany) / [mutations](#mutations).

#### Example

```ts
await adapter.transaction(async executor => {
  const repository = executor.getRepository(Todo);
  const [todo] = await repository.find({ where: { combinator: 'and', rules: [] } });
  await repository.update(todo, { done: true }); // ✅ belongs to this transaction, undone together on rollback
  // await todo.save(); // ❌ outside call: queued behind this transaction, awaiting it in the callback hangs
});
```

---

### mergeChanges() \{#mergechanges\}

```ts
mergeChanges(
   actions,
   localChanges?,
   disableTriggers?
): Promise<void>;
```

Defined in: [packages/rxdb/src/transaction/transaction-executor.interface.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/transaction/transaction-executor.interface.ts#L156)

Applies compacted changes within this transaction.

#### Parameters

| Parameter          | Type                                                             | Description                                                      |
| ------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `actions`          | [`SwitchVersionActions`](SwitchVersionActions.md)                | The compacted change operation set                               |
| `localChanges?`    | `Omit`&lt;[`RxDBChange`](../classes/RxDBChange.md), `"id"`&gt;[] | Records to write into the local `RxDBChange` table along the way |
| `disableTriggers?` | `boolean`                                                        | Whether to disable change triggers (pull and similar scenarios)  |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

The reason it lives on the executor rather than adding an executor parameter to `adapter.mergeChanges()`:
the criterion "holding the executor means inside this transaction" must exist in exactly **one** place. Split into two places,
"passed the executor parameter" and "called the executor's method" would each evolve different boundaries.

It is the main writer of the 4 transaction bodies in the sync chain (`merge-branch` / `cleanup-expired` /
`pull-batch` / `pull-repository`).

---

### mutations() \{#mutations\}

```ts
mutations<T>(options): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/transaction/transaction-executor.interface.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/transaction/transaction-executor.interface.ts#L95)

Executes entity mutations within this transaction.

#### Type Parameters

| Type Parameter                                                                              |
| ------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-1"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type                                                 | Description           |
| --------- | ---------------------------------------------------- | --------------------- |
| `options` | [`RxDBMutationsMap`](RxDBMutationsMap.md)&lt;`T`&gt; | The bulk mutation set |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

---

### query() \{#query\}

```ts
query(sql, params?): Promise<RawQueryResult>;
```

Defined in: [packages/rxdb/src/transaction/transaction-executor.interface.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/transaction/transaction-executor.interface.ts#L70)

Executes a raw query within this transaction, without re-enqueueing.

#### Parameters

| Parameter | Type                 | Description      |
| --------- | -------------------- | ---------------- |
| `sql`     | `string`             | SQL statement    |
| `params?` | readonly `unknown`[] | Bound parameters |

#### Returns

`Promise`&lt;[`RawQueryResult`](RawQueryResult.md)&gt;

---

### removeMany() \{#removemany\}

```ts
removeMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/transaction/transaction-executor.interface.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/transaction/transaction-executor.interface.ts#L139)

Removes multiple entities within this transaction.

#### Type Parameters

| Type Parameter                                                                              |
| ------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-2"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter  | Type                        | Description            |
| ---------- | --------------------------- | ---------------------- |
| `entities` | `InstanceType`&lt;`T`&gt;[] | The entities to remove |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

---

### run() \{#run\}

```ts
run<T>(fun): Promise<T>;
```

Defined in: [packages/rxdb/src/transaction/transaction-executor.interface.ts:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/transaction/transaction-executor.interface.ts#L171)

Nests inner work: reuses this transaction, neither opening a new one nor enqueueing.

#### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-t-3"></a> `T` |

#### Parameters

| Parameter | Type                                 | Description                                                     |
| --------- | ------------------------------------ | --------------------------------------------------------------- |
| `fun`     | (`executor`) => `Promise`&lt;`T`&gt; | The inner work; its argument is the same transaction's executor |

#### Returns

`Promise`&lt;`T`&gt;

#### Remarks

Replaces the old `runInTransaction()` — the latter judged "already in a transaction" by ambient state,
and using it to open a semantically independent concurrent transaction would silently merge into the current one.

---

### saveMany() \{#savemany\}

```ts
saveMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/transaction/transaction-executor.interface.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/transaction/transaction-executor.interface.ts#L132)

Saves multiple entities within this transaction.

#### Type Parameters

| Type Parameter                                                                              |
| ------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-4"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter  | Type                        | Description          |
| ---------- | --------------------------- | -------------------- |
| `entities` | `InstanceType`&lt;`T`&gt;[] | The entities to save |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Remarks

Same semantics as `adapter.saveMany()`; the difference is only belonging: this copy belongs to this transaction.
Calling `adapter.saveMany()` inside a transaction body is an **outside call** that re-enqueues behind this transaction.

---

### tableRef() \{#tableref\}

```ts
tableRef(EntityType): string;
```

Defined in: [packages/rxdb/src/transaction/transaction-executor.interface.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/transaction/transaction-executor.interface.ts#L88)

Resolves an entity into this backend's **physical table reference**, already quoted per the dialect, ready to splice into SQL.

#### Parameters

| Parameter    | Type                                          | Description |
| ------------ | --------------------------------------------- | ----------- |
| `EntityType` | [`EntityType`](../type-aliases/EntityType.md) | Entity type |

#### Returns

`string`

A table reference that can be inserted directly into SQL

#### Remarks

`metadata.tableName` is the **logical** table name, not the physical table name of any backend: PGlite builds the `namespace`
into a schema (`"rxdb"."rxdb_commit_capability"`), the SQLite family splices it into a table name prefix
(`"rxdb$rxdb_commit_capability"`). Splicing `tableName` directly into SQL finds the table on **neither** side.

The naming rules belong to the adapter, not to this package — so the executor answers it, rather than `packages/rxdb`
forking per backend and copying the rules once more. It only serves the one kind of statement described in `system/sql-literal.ts` (single, no placeholders,
CAS); ordinary reads and writes go through [getRepository](#getrepository) / [mutations](#mutations), where table names are resolved by the adapter
itself and callers need not know the physical naming.
