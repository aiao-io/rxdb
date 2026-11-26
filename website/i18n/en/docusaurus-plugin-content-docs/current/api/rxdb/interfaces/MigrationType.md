# MigrationType

Defined in: [packages/rxdb/src/rxdb.interface.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L20)

Upgrade script

The same `name` can only be recorded once in history; re-running a migration with the same name is skipped.
`name` is used as the primary key of the `RxDBMigration` table, so it **must not be renamed**.

## Properties

### name \{#name\}

```ts
name: string;
```

Defined in: [packages/rxdb/src/rxdb.interface.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L24)

Migration name, unique across the database

## Methods

### down() \{#down\}

```ts
down(): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb.interface.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L46)

Rolls back

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

RxDB does not currently trigger `down()` on its own; it is kept to prepare for future "reverse migrations".
Integrators should implement an idempotent rollback path, to make it easy to undo unfinished changes when merging branches.

***

### up() \{#up\}

```ts
up(executor): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb.interface.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L38)

Migrates forward.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `executor` | [`TransactionExecutor`](TransactionExecutor.md) | The executor of the transaction this migration runs in |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

`up()` is the **only** user code that can run inside a transaction body. All data writes in a migration must go through
`executor.getRepository(X)` / `executor.query()` — calling `entity.save()` or
`adapter.query()` directly falls back into the adapter queue, whose single slot is occupied by the transaction this migration runs in,
hanging forever (see ruling ④ in `code-reviews/transaction-executor-design.md`).

The parameter may be omitted (TS allows implementations with fewer parameters); migrations that write no data need not care about it.
