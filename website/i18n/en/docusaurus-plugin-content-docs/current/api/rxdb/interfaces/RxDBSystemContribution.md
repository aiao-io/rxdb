# RxDBSystemContribution

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:238](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L238)

A plugin's contribution to the system layer

## Remarks

All nine registration points are required, each guarding against one kind of accident that would not fail compilation:

- [RxDBSystemContribution.entities](#entities) not wired up → the table cannot be created, and the first use throws an error with no readable subject;
- [RxDBSystemContribution.createInitialRows](#createinitialrows) not in the same `createTables()` → a new database is missing rows on its first
  startup, and a table with missing rows looks exactly like a normal empty table;
- [RxDBSystemContribution.createMigrations](#createmigrations) only wired up for the existing-database half → a new database reruns
  `up()` on its next startup and hits primary keys (see `system/migrations/index.ts`: a new database does **not** run this chain; the names in the chain are
  written directly as executed watermarks by `createMigrationWatermarks()`);
- [RxDBSystemContribution.bootstrapExisting](#bootstrapexisting) not wired up → the existing database connects, but the capability is not
  connected on this connection, and every subsequent write bypasses the capability, **without a single error**;
- [RxDBSystemContribution.writeBranchRows](#writebranchrows) not wired up → a new branch is missing its contribution rows, and a branch with missing rows is
  indistinguishable in shape from a normal branch; it only blows up the next time those rows are fetched by id;
- [RxDBSystemContribution.removeBranchRows](#removebranchrows) not wired up → the branch is deleted, the contribution rows stay, and the leftover rows
  are keyed by id, so after a branch is recreated under the same name they are **hit verbatim** by the new branch — a freshly created branch thus carries the previous one's
  HEAD, the previous one's uncommitted entries, and the previous one's materialization scene left mid-crash;
- [RxDBSystemContribution.prepareBranchSwitch](#preparebranchswitch) not wired up → `switchBranch()` accepts the caller's
  preconditions but nobody validates them, **without a single error**: the user explicitly asked "do not switch if the working tree is dirty", and the switch
  happens anyway — exactly what they just said to avoid; the rows that come with the switch (activation generation +1) are also not written,
  so after a round trip of `main → feature → main`, the credentials captured before leaving still validate.
- [RxDBSystemContribution.takeOverBranchSwitch](#takeoverbranchswitch) not wired up → a normal switch would run on a branch that has no local
  history yet: it has no ref and no working tree state row, and after switching to it the projection is the previous branch's content,
  while the user sees a successful switch;
- [RxDBSystemContribution.settleBranchSwitchFailure](#settlebranchswitchfailure) not wired up → the failure diagnostics can never be persisted.
  This hook is the **only** moment after the rollback when the database can still be written: the failure judgment happens inside the switch transaction, and that transaction
  is doomed to roll back — diagnostics written inside it would vanish along with it.

All nine are **required**; none carries a `?`. Contributors with nothing to write provide an empty implementation — an explicit
statement of "I genuinely don't need it", while `?` makes "not needed" and "forgot" the same thing.

[RxDBSystemContribution.capability](#capability) and [RxDBSystemContribution.packageSpecifier](#packagespecifier)
are for the "unclaimed capability guard": the host writes them into a capability watermark row, after which any client **without this plugin installed**
that opens the database is blocked and told which package to install.

## Properties

### capability \{#capability\}

```ts
readonly capability: Uncapitalize<string>;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:245](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L245)

The capability name, same as [IRxDBPlugin.name](IRxDBPlugin.md#name)

#### Remarks

Watermark rows are attributed by it, so it **must not contain `:`** — the row name is `:`-separated, and a capability name containing colons would be sliced apart by the guard.

---

### entities \{#entities\}

```ts
readonly entities: readonly EntityType[];
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:260](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L260)

The contributed system entities; the order is the table creation order

---

### packageSpecifier \{#packagespecifier\}

```ts
readonly packageSpecifier: string;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:257](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L257)

The package specifier, such as `@aiao/rxdb-plugin-working-tree`; reported to the user as-is when unclaimed

---

### version \{#version\}

```ts
readonly version: number;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:254](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L254)

The capability version, a positive integer

#### Remarks

Written into the watermark row, but **core does not compare it**: only the plugin itself knows whether it can read an old version's tables, and if core interfered,
every new plugin version would have to wait for core to allow it through. Core only answers "whether anyone has claimed this capability".

## Methods

### bootstrapExisting() \{#bootstrapexisting\}

```ts
bootstrapExisting(context): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:301](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L301)

At the end of an existing database's bootstrap, connects this capability onto this connection

#### Parameters

| Parameter | Type                                                            | Description                                                                             |
| --------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `context` | [`RxDBSystemActivationContext`](RxDBSystemActivationContext.md) | The local adapter with tables created, migrations run, and `completeBootstrap()` called |

#### Returns

`Promise`&lt;`void`&gt;

Connection complete; contributors with no connection-time action return a settled promise

#### Remarks

**Only called on existing databases, never once on a new database.** This is not an optimization but the semantics itself: all contribution rows of a new database were
just written by this process in the same `createTables()`, and their values are decided on the spot by [RxDBSystemContribution.createInitialRows](#createinitialrows)
— "read back and see what state it is in" would there be asking what one wrote a line ago. An existing database is different:
its state was left by **someone else**, and only reading it tells.

A new database has one more hard constraint: that table creation is one atomic commit, and opening another transaction outside it would break the
"tables and initial rows in the same batch" invariant.

The call site comes after `reconcileEntityIndexes()` and **before** the adapter's readiness is set. This position must not change:
the readiness flag doubles as the criterion for `adapter:local`, and plugins declaring that dependency are only installed after it — moving this hook
past it would open a window where "other plugins are already writing and this capability is not yet connected", and those writes leave no trace.

---

### createInitialRows() \{#createinitialrows\}

```ts
createInitialRows(entityManager, context): readonly any[];
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:269](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L269)

The initial rows written together with the tables when a new database creates them

#### Parameters

| Parameter       | Type                                                          | Description                                       |
| --------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| `entityManager` | [`EntityManager`](EntityManager.md)                           | Used to `instantiate()` row objects               |
| `context`       | [`RxDBSystemBootstrapContext`](RxDBSystemBootstrapContext.md) | The facts already in place at table creation time |

#### Returns

readonly `any`[]

Rows written in the same batch as [RxDBSystemContribution.entities](#entities); an empty array when there are no initial rows

---

### createMigrations() \{#createmigrations\}

```ts
createMigrations(entityManager): MigrationType[];
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:280](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L280)

The migrations an existing database must run

#### Parameters

| Parameter       | Type                                | Description                                       |
| --------------- | ----------------------------------- | ------------------------------------------------- |
| `entityManager` | [`EntityManager`](EntityManager.md) | Used by migrations to `instantiate()` row objects |

#### Returns

[`MigrationType`](MigrationType.md)[]

The migration list; for a new database `createMigrationWatermarks()` writes them directly as executed watermarks, and `up()` is not run

---

### prepareBranchSwitch() \{#preparebranchswitch\}

```ts
prepareBranchSwitch(context): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:369](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L369)

Validates this capability's preconditions **inside the switch transaction**, and writes the rows this capability should write in one switch

#### Parameters

| Parameter | Type                                                    | Description                                                                                                    |
| --------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `context` | [`RxDBBranchSwitchContext`](RxDBBranchSwitchContext.md) | The switch transaction's executor, the current/target branch ids, and the preconditions proposed by the caller |

#### Returns

`Promise`&lt;`void`&gt;

Done; contributors with no preconditions to check and no rows to write return a settled promise

#### Throws

Any precondition not holding; throwing rolls back the whole switch

#### Remarks

**Runs inside the write transaction of `adapter.switchBranch()`**, called by the adapter through
[SwitchBranchOptions.prepare](SwitchBranchOptions.md#prepare) after the target branch is resolved and before the first row is touched,
exactly once per switch.

It used to run **before** that call, in a read-only transaction of its own, with the stated reason "squeezing it in would require each adapter to open
an opening of its own". That reason does not hold: only `rxdb-adapter-pglite` and
`rxdb-adapter-sqlite-core` actually implement the SQL switch (the sqlite family's five backends share the latter), so it is two openings,
and the way to open them is one more required callback in the arguments, not each adapter writing the validation once more.
The cost side was underestimated: there is a window between the two transactions where the validation says "clean", a write inside the window makes it dirty,
and the switch completes anyway. At the time the window was claimed to be "covered by CAS fields like `expectedActivationRevision`" —
but that field was also compared inside the read-only transaction; it is not a CAS, only a read-then-compare, and covers nothing.

The executor obtained is **writable**, and the rows written live and die with this switch. Being able to write does not mean one should: only
"the rows inevitably brought by one switch itself" (for example activation generation +1) belong here; business data is not in this list.

The name is `prepare` rather than `assert`: its responsibility expanded from "only judging" to "judging + writing the rows that come with the switch",
and `assert*` reads like a check that leaves no trace, which would make the next person move that one write out.
It is not called `canSwitchBranch` either: `can*` reads like returning a `boolean`, while the reason for "cannot switch"
must be reportable to the user together with the branch id, the entry count and the expected/actual revision — only an exception can carry that.

---

### removeBranchRows() \{#removebranchrows\}

```ts
removeBranchRows(context): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:339](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L339)

Every time a branch is removed, clears the rows this capability hangs under its name, **inside the caller's transaction**

#### Parameters

| Parameter | Type                                                      | Description                                                                    |
| --------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `context` | [`RxDBBranchRemovalContext`](RxDBBranchRemovalContext.md) | The caller's transaction executor and the id of the branch about to be deleted |

#### Returns

`Promise`&lt;`void`&gt;

Cleanup complete; contributors with no branch-level rows return a settled promise

#### Remarks

Strictly symmetric with [RxDBSystemContribution.writeBranchRows](#writebranchrows): the **same** contributor is responsible for creating and deleting rows,
because "which tables a branch occupies in this capability" is known only to it. Core knows neither how many tables there are,
nor should it change along when a seventh table is added.

**Does not expect foreign key cascades to do this for it.** Whether cascades take effect is spread across the six backends' `PRAGMA foreign_keys`
and table creation paths, and the contributor's tables may well include several with no relation pointing at `rxdb_branch` at all. A cleanup that is half constraints
and half code is two mechanisms that must watch each other — `remove_branch` already gave the answer for `RxDBChange`:
delete explicitly, even though that table also has cascades attached.

**Does not touch the `rxdb_branch` row** — that is deleted by the caller itself at the end. Nor any database-wide singleton rows: those rows do not belong
to any branch, and deleting them along with a branch would make the whole database fail permanently the next time they are read.

---

### settleBranchSwitchFailure() \{#settlebranchswitchfailure\}

```ts
settleBranchSwitchFailure(context): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:424](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L424)

After the switch transaction **rolls back**, persists the durable diagnostics of this failure

#### Parameters

| Parameter | Type                                                                  | Description                                  |
| --------- | --------------------------------------------------------------------- | -------------------------------------------- |
| `context` | [`RxDBBranchSwitchFailureContext`](RxDBBranchSwitchFailureContext.md) | The current/target branch ids and that error |

#### Returns

`Promise`&lt;`void`&gt;

Persisted; contributors with no diagnostics to persist return a settled promise

#### Remarks

The timing is its whole point: the failure judgment happens inside the switch transaction ([RxDBSystemContribution.prepareBranchSwitch](#preparebranchswitch)
throws), and that transaction is doomed to roll back — writing the diagnostics inside it means they are gone the moment they are written. This function runs after the rollback,
opens its own transaction, and the rows it writes survive.

Specific to the working tree: when `assertCommitGraphIntact()` hits corruption, `CommitBranchRef.status` must be set to
`corrupted_read_only` (FR-051). Without it, every retry rescans the whole graph, and the diagnostic of "when did it start breaking"
is absent forever.

**Must not throw.** This function runs inside a `catch` that is about to rethrow the original error — anything thrown from here
would take its place, and the user would get "database busy while persisting diagnostics" instead of "the target branch's history
cannot be replayed". Contributors wrap their own failures: the diagnostics are **additional** — failing to persist them does not change the fact that this switch already failed,
and covering up the original error is the real loss.

Only called on the **rollback** path. A failure after the switch has committed (the bookkeeping steps) does not call it: active has already switched by then,
and this is not a "did not switch".

---

### takeOverBranchSwitch() \{#takeoverbranchswitch\}

```ts
takeOverBranchSwitch(context): Promise<RxDBBranchSwitchTakeover>;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:399](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L399)

**Before** a normal switch starts, asks whether this switch should be taken over entirely by this capability

#### Parameters

| Parameter | Type                                                                    | Description                                                                                                                                                            |
| --------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `context` | [`RxDBBranchSwitchTakeoverContext`](RxDBBranchSwitchTakeoverContext.md) | The current/target branch ids and the preconditions proposed by the caller; **no executor**, see [RxDBBranchSwitchTakeoverContext](RxDBBranchSwitchTakeoverContext.md) |

#### Returns

`Promise`&lt;[`RxDBBranchSwitchTakeover`](../type-aliases/RxDBBranchSwitchTakeover.md)&gt;

`'switched'` means active has already been switched by this contributor; `'not_applicable'` means proceed with the normal path

#### Throws

When this switch should not happen; throwing fails the whole switch, and active stays where it was

#### Remarks

It exists for exactly one reason: **some switch targets are not yet a switchable branch locally**. The remote branch received by `syncBranches()`
has only metadata, and switching to it for the first time must first pull the remote snapshot and materialize it into local history (FR-044/049),
while none of the three stages of that pipeline — prefetch, paged persistence, commit barrier — can run inside
[RxDBSystemContribution.prepareBranchSwitch](#preparebranchswitch): prefetch is network I/O, paged persistence requires each page
to be committable on its own, and the barrier must land in the same transaction as switching active, so only the takeover side can initiate that switch itself.

The division of labor is thus: the takeover side does the switch **entirely** (including calling `adapter.switchBranch()` itself and putting the barrier into
its `prepare`), core skips the normal path and only adds the bookkeeping unrelated to the switch (redo stack, undo view,
`SwitchBranchCommitEvent`).

**The first to answer `'switched'` is the last**: core asks up to it, and no later contributor is asked at all.
Two contributors taking over would switch active twice, and the second would see the scene already produced by the first.

Prefetch and paged persistence run **outside** the switch transaction and do not live or die with it: when the takeover fails, the persisted staging
is left for the next attempt to reuse (resumable and voidable by attempt, see FR-044), and core does not roll it back on its behalf; the barrier stage rolls back
with the switch transaction, and active stays where it was.

The name is `takeOver` rather than `beforeSwitch`: `before*` reads like a pre-hook that does not change the main flow,
while this hook's return value **decides whether the main flow runs at all**.

---

### writeBranchRows() \{#writebranchrows\}

```ts
writeBranchRows(entityManager, context): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:318](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L318)

Every time a branch is created, writes this capability's rows **inside the caller's transaction**

#### Parameters

| Parameter       | Type                                                        | Description                                                             |
| --------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| `entityManager` | [`EntityManager`](EntityManager.md)                         | Used to `instantiate()` row objects                                     |
| `context`       | [`RxDBBranchCreationContext`](RxDBBranchCreationContext.md) | The caller's transaction executor and the id of the branch just written |

#### Returns

`Promise`&lt;`void`&gt;

Write complete; contributors with no branch-level rows return a settled promise

#### Remarks

The difference from [RxDBSystemContribution.createInitialRows](#createinitialrows) is the **timing**, not the content: that one is
once per database (at table creation), this one is once per branch (including the `main` created with the database — but `main` goes through
`createInitialRows`, because no transaction is open for anyone at that moment).

The name is not `onBranchCreated`: `on*` reads like a listener that can be subscribed to, can fail, and can be patched up later,
while the rows here **must live and die with the branch row**. Throwing rolls back the whole `create_branch` transaction — and that is correct.
