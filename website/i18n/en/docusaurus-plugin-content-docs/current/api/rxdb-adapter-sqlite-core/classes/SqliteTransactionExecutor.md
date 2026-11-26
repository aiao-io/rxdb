# SqliteTransactionExecutor

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts#L81)

SQLite-side implementation of [TransactionExecutor](../../rxdb/interfaces/TransactionExecutor.md).

## Remarks

Holding it = having the right to execute within that transaction; calls without it always enqueue again. Transaction identity is represented by **object identity**,
no longer inferred from a `#transaction_lock` boolean ambient state on the adapter instance
(design in `code-reviews/transaction-executor-design.md` §4).

## Implements

- [`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md)

## Constructors

### Constructor

```ts
new SqliteTransactionExecutor(
   adapter,
   client,
   id
): SqliteTransactionExecutor;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts#L108)

#### Parameters

| Parameter | Type                                                    |
| --------- | ------------------------------------------------------- |
| `adapter` | [`RxDBAdapterSqliteBase`](RxDBAdapterSqliteBase.md)     |
| `client`  | [`SqliteClientLike`](../interfaces/SqliteClientLike.md) |
| `id`      | `string`                                                |

#### Returns

`SqliteTransactionExecutor`

## Properties

### id \{#id\}

```ts
readonly id: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts#L88)

Transaction identifier, for logs and assertions.

#### Remarks

Do **not** use it to decide whether two executors are the same transaction — use object identity (`a === b`).

#### Implementation of

[`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md).[`id`](../../rxdb/interfaces/TransactionExecutor.md#id)

## Accessors

### adapter \{#adapter\}

#### Get Signature

```ts
get adapter(): RxDBAdapterSqliteBase;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts#L104)

**`Internal`**

Adapter facade scoped to the transaction: hand it to internal helpers, and every `query()` the helper makes lands in this transaction.

##### Returns

[`RxDBAdapterSqliteBase`](RxDBAdapterSqliteBase.md)

---

### state \{#state\}

#### Get Signature

```ts
get state(): TransactionExecutorState;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts#L90)

Lifecycle state.

##### Returns

[`TransactionExecutorState`](../../rxdb/type-aliases/TransactionExecutorState.md)

Lifecycle state.

#### Implementation of

[`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md).[`state`](../../rxdb/interfaces/TransactionExecutor.md#state)

---

### tableSet \{#tableset\}

#### Get Signature

```ts
get tableSet(): WorktreeTableSet;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts#L95)

Which business table set this transaction lands on: the one mounted on the adapter's instance

##### Returns

[`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)

Which business table set this transaction lands on: the one mounted on the instance that started it (US-314 writable checkout)

#### Remarks

Code inside the transaction that needs to read the "current branch" uses its `heldBranchWhere`: when mounted on a writable checkout, the current branch is the branch held by that table set,
not the one activated on the main checkout. [tableRef](../../rxdb/interfaces/TransactionExecutor.md#tableref) also uses it to build physical names.

#### Implementation of

[`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md).[`tableSet`](../../rxdb/interfaces/TransactionExecutor.md#tableset)

## Methods

### execute() \{#execute\}

```ts
execute(sql, bindings?): Promise<SqliteSuccessResult>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts#L122)

Executes a statement directly on this transaction's connection.

#### Parameters

| Parameter   | Type                                                                |
| ----------- | ------------------------------------------------------------------- |
| `sql`       | `string`                                                            |
| `bindings?` | [`SQLiteCompatibleType`](../type-aliases/SQLiteCompatibleType.md)[] |

#### Returns

`Promise`&lt;[`SqliteSuccessResult`](../interfaces/SqliteSuccessResult.md)&gt;

#### Remarks

A pass-through entry specific to the SQLite side, kept compatible with the existing `transaction(async tx => tx.execute(sql))` style.
The cross-adapter portable entry is [query](#query).

---

### getRepository() \{#getrepository\}

```ts
getRepository<T>(EntityType): IRepository<T>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts:154](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts#L154)

Gets a repository within this transaction.

#### Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter    | Type | Description |
| ------------ | ---- | ----------- |
| `EntityType` | `T`  | Entity type |

#### Returns

[`IRepository`](../../rxdb/interfaces/IRepository.md)&lt;`T`&gt;

#### Remarks

All reads and writes issued by this repository belong to this transaction, **reads included** — a read through the plain `adapter.query()`
inside a transaction body queues behind this very transaction, causing a hang (queue concurrency is 1).

Ownership only follows the **call entry point**, not the entity: entities read or created via this repository are no different from entities from elsewhere;
their `entity.save()` / `entity.remove()` are always external calls that enqueue again, behind this transaction —
awaiting them inside the transaction callback hangs (see the class-level note). To write within this transaction, use this repository's `create()` / `update()` /
`remove()`, or this executor's [saveMany](../../rxdb/interfaces/TransactionExecutor.md#savemany) / [removeMany](../../rxdb/interfaces/TransactionExecutor.md#removemany) / [mutations](../../rxdb/interfaces/TransactionExecutor.md#mutations).

#### Example

```ts
await adapter.transaction(async executor => {
  const repository = executor.getRepository(Todo);
  const [todo] = await repository.find({ where: { combinator: 'and', rules: [] } });
  await repository.update(todo, { done: true }); // ✅ Belongs to this transaction, undone together on rollback
  // await todo.save(); // ❌ External call: queued behind this transaction; awaiting it in the callback hangs
});
```

#### Implementation of

[`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md).[`getRepository`](../../rxdb/interfaces/TransactionExecutor.md#getrepository)

---

### mergeChanges() \{#mergechanges\}

```ts
mergeChanges(
   actions,
   localChanges?,
   disableTriggers?
): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts#L174)

Applies compressed changes within this transaction.

#### Parameters

| Parameter          | Type                                                                     | Default value | Description                                                     |
| ------------------ | ------------------------------------------------------------------------ | ------------- | --------------------------------------------------------------- |
| `actions`          | [`SwitchVersionActions`](../../rxdb/interfaces/SwitchVersionActions.md)  | `undefined`   | Compressed change operation set                                 |
| `localChanges?`    | `Omit`&lt;[`RxDBChange`](../../rxdb/classes/RxDBChange.md), `"id"`&gt;[] | `undefined`   | Records to write into the local `RxDBChange` table as well      |
| `disableTriggers?` | `boolean`                                                                | `false`       | Whether to disable change triggers (pull and similar scenarios) |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Why it lives on the executor instead of giving `adapter.mergeChanges()` an executor parameter:
the criterion "holding the executor counts as being inside this transaction" must exist in exactly **one** place. Once split into two,
"passed an executor parameter" and "called the executor's method" would each evolve different boundaries.

This is the main write of the 4 transaction bodies in the sync chain (`merge-branch` / `cleanup-expired` /
`pull-batch` / `pull-repository`).

#### Implementation of

[`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md).[`mergeChanges`](../../rxdb/interfaces/TransactionExecutor.md#mergechanges)

---

### mutations() \{#mutations\}

```ts
mutations<T>(options): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts:149](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts#L149)

Executes entity mutations within this transaction.

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-1"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type                                                                       | Description       |
| --------- | -------------------------------------------------------------------------- | ----------------- |
| `options` | [`RxDBMutationsMap`](../../rxdb/interfaces/RxDBMutationsMap.md)&lt;`T`&gt; | Bulk mutation set |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Implementation of

[`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md).[`mutations`](../../rxdb/interfaces/TransactionExecutor.md#mutations)

---

### query() \{#query\}

```ts
query(sql, params?): Promise<RawQueryResult>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts:128](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts#L128)

Executes a raw query within this transaction, without enqueueing again.

#### Parameters

| Parameter | Type                 | Description     |
| --------- | -------------------- | --------------- |
| `sql`     | `string`             | SQL statement   |
| `params?` | readonly `unknown`[] | Bind parameters |

#### Returns

`Promise`&lt;[`RawQueryResult`](../../rxdb/interfaces/RawQueryResult.md)&gt;

#### Implementation of

[`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md).[`query`](../../rxdb/interfaces/TransactionExecutor.md#query)

---

### removeMany() \{#removemany\}

```ts
removeMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts:169](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts#L169)

Deletes multiple entities within this transaction.

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-2"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter  | Type                        | Description        |
| ---------- | --------------------------- | ------------------ |
| `entities` | `InstanceType`&lt;`T`&gt;[] | Entities to delete |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Implementation of

[`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md).[`removeMany`](../../rxdb/interfaces/TransactionExecutor.md#removemany)

---

### run() \{#run\}

```ts
run<T>(fun): Promise<T>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts:188](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts#L188)

Nested inner work: reuses this transaction, neither opening a new one nor enqueueing.

#### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-t-3"></a> `T` |

#### Parameters

| Parameter | Type                                 | Description                                                    |
| --------- | ------------------------------------ | -------------------------------------------------------------- |
| `fun`     | (`executor`) => `Promise`&lt;`T`&gt; | Inner work, whose parameter is the same transaction's executor |

#### Returns

`Promise`&lt;`T`&gt;

#### Remarks

Replaces the old `runInTransaction()` — the latter decided "am I already in a transaction" from ambient state,
so using it to open a semantically independent concurrent transaction would be silently merged into the current transaction.

#### Implementation of

[`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md).[`run`](../../rxdb/interfaces/TransactionExecutor.md#run)

---

### saveMany() \{#savemany\}

```ts
saveMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts:164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts#L164)

Saves multiple entities within this transaction.

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-4"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Parameters

| Parameter  | Type                        | Description      |
| ---------- | --------------------------- | ---------------- |
| `entities` | `InstanceType`&lt;`T`&gt;[] | Entities to save |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Remarks

Same semantics as `adapter.saveMany()`; the only difference is ownership: this one belongs to this transaction.
Calling `adapter.saveMany()` inside a transaction body is an **external call** that enqueues again, behind this transaction.

#### Implementation of

[`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md).[`saveMany`](../../rxdb/interfaces/TransactionExecutor.md#savemany)

---

### settle() \{#settle\}

```ts
settle(state): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts:198](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts#L198)

**`Internal`**

Pushes the executor into a terminal state. Only the adapter's transaction executor body may call it.

#### Parameters

| Parameter | Type                             |
| --------- | -------------------------------- |
| `state`   | `"committed"` \| `"rolled-back"` |

#### Returns

`void`

---

### tableRef() \{#tableref\}

```ts
tableRef(EntityType): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts#L145)

Physical table reference of the SQLite family: `namespace` is the table name prefix, assembled as `"rxdb$rxdb_change"`.

#### Parameters

| Parameter    | Type                                                  |
| ------------ | ----------------------------------------------------- |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Returns

`string`

#### Remarks

Uses the same pair of [get\_table\_name\_by\_metadata](../functions/get_table_name_by_metadata.md)
and [quote\_sql\_identifier](../functions/quote_sql_identifier.md) as the table-creation path (`table/create_table_sql.ts`), rather than writing another assembly — once the two assemblies diverge, CAS would run against a
table that does not exist. `$` is not a legal character in unquoted identifiers, so the quotes cannot be omitted.

#### Implementation of

[`TransactionExecutor`](../../rxdb/interfaces/TransactionExecutor.md).[`tableRef`](../../rxdb/interfaces/TransactionExecutor.md#tableref)
