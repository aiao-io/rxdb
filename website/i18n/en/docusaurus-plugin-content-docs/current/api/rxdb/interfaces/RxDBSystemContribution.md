# RxDBSystemContribution

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:238](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L238)

A plugin's contribution to the system layer

## Remarks

All nine registration points are required; each prevents one kind of accident that would not surface as a compile error:

- Missing [RxDBSystemContribution.entities](#entities) → the tables cannot be created, and first use throws an error with no discernible subject;
- [RxDBSystemContribution.createInitialRows](#createinitialrows) not in the same `createTables()` → a fresh database is missing rows from its very first start, and a table missing rows looks exactly like a normal empty table;
- [RxDBSystemContribution.createMigrations](#createmigrations) wired only for existing databases → on the fresh database's next start, re-running `up()` collides on primary keys (see `system/migrations/index.ts`: fresh databases **do not run** this chain; its names are written directly as executed watermarks by `createMigrationWatermarks()`);
- Missing [RxDBSystemContribution.bootstrapExisting](#bootstrapexisting) → the existing database connects, but the capability is never wired onto this connection; every subsequent write bypasses the capability, **with not a single error**;
- Missing [RxDBSystemContribution.writeBranchRows](#writebranchrows) → new branches lack contribution rows, and a branch missing rows is indistinguishable in shape from a normal branch; it only blows up the next time those rows are fetched by id;
- Missing [RxDBSystemContribution.removeBranchRows](#removebranchrows) → the branch is deleted but its contribution rows remain; the leftover rows hang by id, so a same-name rebuild makes the new branch **hit them verbatim** — a freshly created branch then carries the previous one's HEAD, the previous one's uncommitted entries, and the previous one's half-crashed materialization state;
- Missing [RxDBSystemContribution.prepareBranchSwitch](#preparebranchswitch) → `switchBranch()` accepts the caller's preconditions but nobody validates them, **with not a single error**: the user explicitly asked "don't switch if the working tree is dirty", yet the switch happens — exactly what they just said to avoid; the rows that come with the switch (activation generation +1) also fail to land, so after one `main → feature → main` round trip, credentials captured before leaving still validate.
- Missing [RxDBSystemContribution.takeOverBranchSwitch](#takeoverbranchswitch) → an ordinary switch runs as usual onto a branch with no local history yet: it has no ref and no working tree state rows; after switching, the projection shows the previous branch's content, while the user sees a successful switch;
- Missing [RxDBSystemContribution.settleBranchSwitchFailure](#settlebranchswitchfailure) → failure diagnostics can never be persisted. This hook is the **only** moment after the rollback when the database can still be written: the failure judgment happens inside the switch transaction, and that transaction is doomed to roll back, so diagnostics written inside it disappear with it.

All nine are **required**; none carries a `?`. Contributors with nothing to write provide an empty implementation — an explicit "I genuinely don't need it" — whereas `?` would make "not needed" and "forgotten" the same thing.

[RxDBSystemContribution.capability](#capability) and [RxDBSystemContribution.packageSpecifier](#packagespecifier)
serve the "unclaimed capability guard": the host writes them as a capability watermark row, after which any client **without this plugin installed** that opens the database is blocked and told which package to install.

## Properties

### capability \{#capability\}

```ts
readonly capability: Uncapitalize<string>;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:245](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L245)

The capability name, same value as [IRxDBPlugin.name](IRxDBPlugin.md#name)

#### Remarks

Watermark rows are attributed by it, so it **must not contain `:`** — row names are `:`-separated, and a capability name containing colons would be shredded by the guard.

---

### entities \{#entities\}

```ts
readonly entities: readonly EntityType[];
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:260](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L260)

The contributed system entities; the order is the table-creation order

---

### packageSpecifier \{#packagespecifier\}

```ts
readonly packageSpecifier: string;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:257](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L257)

The package specifier, e.g. `@aiao/rxdb-plugin-working-tree`; reported to the user as-is when unclaimed

---

### version \{#version\}

```ts
readonly version: number;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:254](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L254)

The capability version, a positive integer

#### Remarks

Written into the watermark row, but **core does not compare it**: only the plugin itself knows whether it can read older-version tables, and if core meddled, the plugin would need core's go-ahead for every version bump. Core only answers "whether someone claimed this capability".

## Methods

### bootstrapExisting() \{#bootstrapexisting\}

```ts
bootstrapExisting(context): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:301](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L301)

At the end of an existing database's bootstrap, wires this capability onto this connection

#### Parameters

| Parameter | Type                                                            | Description                                                                     |
| --------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `context` | [`RxDBSystemActivationContext`](RxDBSystemActivationContext.md) | The local adapter with tables created, migrated, and `completeBootstrap()` done |

#### Returns

`Promise`&lt;`void`&gt;

Wiring complete; contributors with no connection-time actions return a resolved promise

#### Remarks

**Called only on existing databases; never on fresh ones.** This is not an optimization but the semantics itself: on a fresh database all contribution rows were just written by this process in the same `createTables()`, and their values were decided on the spot by [RxDBSystemContribution.createInitialRows](#createinitialrows) — "read it back to see the state" would there be asking itself what it wrote a line ago. An existing database is different: its state was left by **someone else**, and only reading reveals it.

A fresh database carries one more hard constraint: that table creation is one atomic commit, and opening another transaction outside it would break the invariant "tables and initial rows land in the same batch".

The call site sits after `reconcileEntityIndexes()` and **before** the adapter readiness bit is set. This position cannot change:
the readiness bit doubles as the criterion for `adapter:local`, and plugins declaring that dependency are only installed after it — moving this hook
past it would open a window where "other plugins are already writing while this capability is not yet wired", and those writes leave no trace.

---

### createInitialRows() \{#createinitialrows\}

```ts
createInitialRows(entityManager, context): readonly any[];
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:269](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L269)

Initial rows written once, together with the tables, when a fresh database creates them

#### Parameters

| Parameter       | Type                                                          | Description                                         |
| --------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| `entityManager` | [`EntityManager`](EntityManager.md)                           | Used to `instantiate()` row objects                 |
| `context`       | [`RxDBSystemBootstrapContext`](RxDBSystemBootstrapContext.md) | The facts that already exist at table-creation time |

#### Returns

readonly `any`[]

Rows written in the same batch as [RxDBSystemContribution.entities](#entities); return an empty array when there are no initial rows

---

### createMigrations() \{#createmigrations\}

```ts
createMigrations(entityManager): MigrationType[];
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:280](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L280)

Migrations to run on existing databases

#### Parameters

| Parameter       | Type                                | Description                                      |
| --------------- | ----------------------------------- | ------------------------------------------------ |
| `entityManager` | [`EntityManager`](EntityManager.md) | Migrations use it to `instantiate()` row objects |

#### Returns

[`MigrationType`](MigrationType.md)[]

The migration list; on fresh databases `createMigrationWatermarks()` writes them directly as executed watermarks without running `up()`

---

### prepareBranchSwitch() \{#preparebranchswitch\}

```ts
prepareBranchSwitch(context): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:369](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L369)

Inside the **switch transaction**, validates this capability's preconditions and lands the rows this capability should land in one switch

#### Parameters

| Parameter | Type                                                    | Description                                                                                         |
| --------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `context` | [`RxDBBranchSwitchContext`](RxDBBranchSwitchContext.md) | The switch transaction's executor, current/target branch ids, and the caller-proposed preconditions |

#### Returns

`Promise`&lt;`void`&gt;

Done; contributors with no preconditions to check and no rows to land return a resolved promise

#### Throws

When any precondition fails; throwing rolls back the whole switch

#### Remarks

**Runs inside `adapter.switchBranch()`'s write transaction**, called back by the adapter through
[SwitchBranchOptions.prepare](SwitchBranchOptions.md#prepare) after the target branch is resolved and before the first row is touched,
exactly once per switch.

It used to run **before** that call in its own read-only transaction, justified as "embedding it would require opening a hook in every adapter". That justification does not hold: only `rxdb-adapter-pglite` and
`rxdb-adapter-sqlite-core` actually implement the SQL switch (the SQLite family's five backends share the latter), so it opens two hooks,
and the way to open them is one extra required callback on the parameter, not one validation written per adapter.
The cost side was underestimated: between the two transactions there is a window — the validation says "clean", a write inside the window makes it dirty,
and the switch still completes. Back then the note said this window was "covered by CAS fields like `expectedActivationRevision`" —
but that field was also compared inside a read-only transaction; it is not a CAS, just a compare-after-read, and it covers nothing.

The executor obtained is **writable**; rows written here live and die with this switch. Writable does not mean should-write: only
"the rows inevitably brought by one switch itself" belong here (e.g. activation generation +1); business data is not among them.

The name is `prepare`, not `assert`: its responsibility grew from "only judge" to "judge + land the rows that come with the switch",
and `assert*` reads like a check that leaves no trace, which would tempt the next person to move that write out.
Nor is it `canSwitchBranch`: `can*` reads like returning a `boolean`, while the reason for "cannot switch"
must reach the user together with the branch id, entry count and expected/actual revision — only an exception can carry that.

---

### removeBranchRows() \{#removebranchrows\}

```ts
removeBranchRows(context): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:339](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L339)

On every branch removal, cleans up, **inside the caller's transaction**, the rows this capability keeps under that branch's name

#### Parameters

| Parameter | Type                                                      | Description                                                                    |
| --------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `context` | [`RxDBBranchRemovalContext`](RxDBBranchRemovalContext.md) | The caller's transaction executor and the id of the branch about to be deleted |

#### Returns

`Promise`&lt;`void`&gt;

Cleanup complete; contributors with no branch-level rows return a resolved promise

#### Remarks

Strictly symmetric with [RxDBSystemContribution.writeBranchRows](#writebranchrows): row creation and row deletion are the **same**
contributor's responsibility, because only it knows "which tables one branch occupies in this capability". Core neither knows how many tables there are,
nor should it change along when a seventh table is added.

**Does not rely on foreign-key cascades to do this.** Whether cascades take effect is spread across the six backends' respective `PRAGMA foreign_keys`
and table-creation paths, and the contributor's tables may well include some with no relation to `rxdb_branch` at all. A cleanup half by constraints,
half by code is two mechanisms that must watch each other — `remove_branch` already gave the answer for `RxDBChange`:
delete explicitly, even though that table also carries a cascade.

**Does not touch the `rxdb_branch` row itself** — the caller deletes that last. Nor any whole-database singleton rows: those belong to
no branch, and deleting them along with a branch would make the whole database fail permanently the next time they are read.

---

### settleBranchSwitchFailure() \{#settlebranchswitchfailure\}

```ts
settleBranchSwitchFailure(context): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:424](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L424)

After the switch transaction **rolls back**, lands the persistent diagnostics of this failure

#### Parameters

| Parameter | Type                                                                  | Description                              |
| --------- | --------------------------------------------------------------------- | ---------------------------------------- |
| `context` | [`RxDBBranchSwitchFailureContext`](RxDBBranchSwitchFailureContext.md) | Current/target branch ids and that error |

#### Returns

`Promise`&lt;`void`&gt;

Landed; contributors with no diagnostics to land return a resolved promise

#### Remarks

The timing is everything: the failure judgment happens inside the switch transaction (thrown by [RxDBSystemContribution.prepareBranchSwitch](#preparebranchswitch)),
and that transaction is doomed to roll back — writing diagnostics inside it means writing them into oblivion. This function runs only after the rollback,
opens its own transaction, and the rows it writes survive.

Concretely for the working tree: when `assertCommitGraphIntact()` hits corruption, `CommitBranchRef.status` must land as
`corrupted_read_only` (FR-051). Without it, every retry re-scans the whole graph, and the diagnostic "when did it start breaking"
is forever absent.

**Must not throw.** This function runs inside a `catch`, right before the original error is rethrown — anything thrown from here
would replace that error, leaving the user with "database busy while persisting diagnostics" instead of "cannot replay the target branch's
history". Contributors wrap their own failures: diagnostics are **supplementary**; failing to land them does not change the fact that this switch
already failed, while covering up the original error would be the real loss.

Called only on the **rollback** path. Failures after the switch has already committed (the bookkeeping steps) do not call it: active has
already switched by then, and this is not a "switch that didn't make it".

---

### takeOverBranchSwitch() \{#takeoverbranchswitch\}

```ts
takeOverBranchSwitch(context): Promise<RxDBBranchSwitchTakeover>;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:399](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L399)

**Before** an ordinary switch begins, asks whether this switch should be taken over entirely by this capability

#### Parameters

| Parameter | Type                                                                    | Description                                                                                                                                                  |
| --------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `context` | [`RxDBBranchSwitchTakeoverContext`](RxDBBranchSwitchTakeoverContext.md) | Current/target branch ids and the caller-proposed preconditions; **no executor** — see [RxDBBranchSwitchTakeoverContext](RxDBBranchSwitchTakeoverContext.md) |

#### Returns

`Promise`&lt;[`RxDBBranchSwitchTakeover`](../type-aliases/RxDBBranchSwitchTakeover.md)&gt;

`'switched'` means this contributor has already switched active over; `'not_applicable'` means proceed down the ordinary path as usual

#### Throws

When this switch should not happen; throwing fails the whole switch, and active stays where it was

#### Remarks

It exists for one reason only: **some switch targets are not yet switchable branches locally**. Remote branches received by
`syncBranches()` carry only metadata; the first switch to one must first pull the remote snapshot down and materialize it into local history (FR-044/049),
and none of that pipeline's three stages — prefetch, paged persistence, commit barrier — can run inside
[RxDBSystemContribution.prepareBranchSwitch](#preparebranchswitch): prefetch is network I/O, paged persistence requires each page
to be individually committable, and the barrier must land in the same transaction as the active switch, so only the taker-over can initiate that switch itself.

So the division of labor is: the taker-over completes the switch **in its entirety** (including calling `adapter.switchBranch()` itself and putting the barrier into
its `prepare`), while core skips the ordinary path and only tops up the switch-unrelated bookkeeping (redo stack, undo view,
`SwitchBranchCommitEvent`).

**The first one to answer `'switched'` is the last**: core stops asking there and never asks the remaining contributors.
Two contributors taking over would mean active switching twice, and the second would see a scene that is already the first one's result.

Prefetch and paged persistence run **outside** the switch transaction and do not live or die with it: when the takeover fails, the already-persisted staging
is left for the next attempt to resume (resumable or discardable by attempt, see FR-044), and core does not roll it back on its behalf; the barrier stage rolls back
together with the switch transaction, and active stays where it was.

The name is `takeOver`, not `beforeSwitch`: `before*` reads like a pre-hook that does not change the main flow,
while this hook's return value **decides whether the main flow runs at all**.

---

### writeBranchRows() \{#writebranchrows\}

```ts
writeBranchRows(entityManager, context): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:318](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L318)

On every new branch, writes this capability's rows **inside the caller's transaction**

#### Parameters

| Parameter       | Type                                                        | Description                                                             |
| --------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| `entityManager` | [`EntityManager`](EntityManager.md)                         | Used to `instantiate()` row objects                                     |
| `context`       | [`RxDBBranchCreationContext`](RxDBBranchCreationContext.md) | The caller's transaction executor and the id of the branch just written |

#### Returns

`Promise`&lt;`void`&gt;

Write complete; contributors with no branch-level rows return a resolved promise

#### Remarks

The difference from [RxDBSystemContribution.createInitialRows](#createinitialrows) is **timing**, not content: that one is
once per database (at table creation), this one once per branch (including the `main` created with the database — but `main` goes through
`createInitialRows`, because at that moment the transaction is not yet open to anyone).

Not named `onBranchCreated`: `on*` reads like a listener that can be subscribed, can fail, and can be made up later,
while these rows **must live and die with the branch row**. Throwing rolls back the whole `create_branch` transaction — and that is correct.
