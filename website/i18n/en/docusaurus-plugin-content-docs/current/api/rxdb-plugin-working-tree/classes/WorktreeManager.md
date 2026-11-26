# WorktreeManager

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L155)

Entry point for checkouts: `rxdb.workingTree.checkouts`.

## Constructors

### Constructor

```ts
new WorktreeManager(
   rxdb,
   runEnabled,
   options
): WorktreeManager;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L171)

Constructed by the working tree facade, one per RxDB instance.

#### Parameters

| Parameter    | Type                                                                        | Description                                                                    |
| ------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `rxdb`       | [`RxDB`](../../rxdb/classes/RxDB.md)                                        | The main instance                                                              |
| `runEnabled` | [`WorktreeTransactionRunner`](../type-aliases/WorktreeTransactionRunner.md) | The facade's managed transaction; main-database transactions all pass its gate |
| `options`    | [`WorktreeOptions`](../interfaces/WorktreeOptions.md) \| `undefined`        | The plugin's `worktrees` option                                                |

#### Returns

`WorktreeManager`

## Methods

### add() \{#add\}

```ts
add(branchId, options?): Promise<Worktree>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:332](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L332)

Opens a writable checkout: registers it, holds the branch, creates the shadow table set, and seeds it, all in one main-database transaction; does not mount after creation, this context claims it.

#### Parameters

| Parameter  | Type                                                        | Description                                                             |
| ---------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| `branchId` | `string`                                                    | The branch to check out in this checkout; must have complete local data |
| `options?` | [`WorktreeAddOptions`](../interfaces/WorktreeAddOptions.md) | See [WorktreeAddOptions](../interfaces/WorktreeAddOptions.md)           |

#### Returns

`Promise`&lt;[`Worktree`](Worktree.md)&gt;

The registration row

#### Throws

[WorktreeUnavailableError](WorktreeUnavailableError.md) `unsupported_adapter`: the main database's adapter cannot create the table set; `branch_not_found` /
`branch_not_materialized`; `invalid_name` / `name_taken`: the given name is empty or already used by another writable checkout;
the runtime has no Web Locks (`locks_unavailable`)

#### Throws

WorktreeBranchHeldError the branch is already held: the main checkout is sitting on it, or another writable checkout holds it (git: `already used by worktree`)

#### Remarks

Seeding = the main table set's rows copied verbatim, then the delta from "the branch the main checkout is on" to "this branch" applied on top, row-by-row identical to what switching over reads; neither records into the change log.
Does not advance the activation state: the main checkout's working tree, current branch, and `activationRevision` are untouched; this table set's own activation state row is created in the same transaction
(switching branches inside the checkout only advances it, B2.2). When no name is given, the branch id is used; if taken, `-2`, `-3` are appended.
GitHub Desktop switches over after creating, which corresponds to [WorktreeManager.mount](#mount).

---

### attach() \{#attach\}

```ts
attach(id): Promise<WorktreeView>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:235](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L235)

Opens a persistent-ownership checkout again without rebuilding the snapshot.

#### Parameters

| Parameter | Type     | Description                                            |
| --------- | -------- | ------------------------------------------------------ |
| `id`      | `string` | Checkout id (the row in [WorktreeManager.list](#list)) |

#### Returns

`Promise`&lt;[`WorktreeView`](../interfaces/WorktreeView.md)&gt;

The open view

#### Throws

[WorktreeUnavailableError](WorktreeUnavailableError.md) `in_use`: it is open elsewhere; `not_found`: there is no such persistent, finished checkout,
or the registration row is still there but the snapshot database is gone (in which case the registration row is reclaimed as well); `schema_mismatch`: the app's entity structure changed after it was built, open a new one

---

### dispose() \{#dispose\}

```ts
dispose(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L187)

**`Internal`**

Waits for in-flight commands to finish and returns all writable checkout claim locks; called after the adapter disconnects.

#### Returns

`Promise`&lt;`void`&gt;

---

### list() \{#list\}

```ts
list(): Promise<Worktree[]>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:289](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L289)

All checkouts registered in this database, sorted by registration time.

#### Returns

`Promise`&lt;[`Worktree`](Worktree.md)[]&gt;

The registration rows

---

### mount() \{#mount\}

```ts
mount(id): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:351](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L351)

Makes the main instance mount a writable checkout: from then on reads and writes land on that shadow table set, and capture and commits are recorded on the branch it holds.

#### Parameters

| Parameter | Type     | Description                                            |
| --------- | -------- | ------------------------------------------------------ |
| `id`      | `string` | Checkout id (the row in [WorktreeManager.list](#list)) |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[WorktreeUnavailableError](WorktreeUnavailableError.md) `in_use`: it is claimed elsewhere; `not_found`: not a finished writable checkout, or the branch it holds no longer exists;
`schema_rebuild_failed`: fingerprint mismatch, and rebuilding under the new structure failed (the whole transaction rolls back and the checkout stays as-is; `cause` is the original error)

#### Remarks

Claims it first if not claimed (takes its lock); returns the lock if mounting fails. Re-mounting swaps the whole instance: entity caches are cleared, all live queries re-run, and the undo stack switches over to that branch.
When already mounted on it and no rebuild is needed, does nothing.

The registration row records the table set's fingerprint from when it was opened (the fingerprint of the member entities' structure combined with the plugin's table-set-creation hook fingerprint, `RxDB.worktreeTableSetFingerprint`).
If an app upgrade changed the entities, or the plugin's attached objects on the tables changed, the fingerprint no longer matches: the whole set is rebuilt under the new structure within the mounting transaction (US-314 B2.6),
see `#rebuild`.

---

### mountMain() \{#mountmain\}

```ts
mountMain(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:356](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L356)

Makes the main instance mount back onto the main checkout; a claimed writable checkout stays claimed.

#### Returns

`Promise`&lt;`void`&gt;

---

### open() \{#open\}

```ts
open(target, options?): Promise<WorktreeView>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:205](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L205)

Opens another branch, or the complete data of a reachable commit on the current branch, read-only; does not switch branches and does not touch the working tree.

#### Parameters

| Parameter  | Type                                                          | Description                                                     |
| ---------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| `target`   | [`WorktreeTarget`](../type-aliases/WorktreeTarget.md)         | `{ branchId }` branch view, `{ commitId }` commit view          |
| `options?` | [`WorktreeOpenOptions`](../interfaces/WorktreeOpenOptions.md) | See [WorktreeOpenOptions](../interfaces/WorktreeOpenOptions.md) |

#### Returns

`Promise`&lt;[`WorktreeView`](../interfaces/WorktreeView.md)&gt;

The open view; [WorktreeView.close](../interfaces/WorktreeView.md#close) when done

#### Throws

[WorktreeUnavailableError](WorktreeUnavailableError.md) no snapshot database configured, backend unsupported, or no Web Locks in the runtime; branch does not exist or only local
metadata; commit unreachable, unrecognized entities on the path, or a restore in progress (same criterion as `restore()`)

---

### prune() \{#prune\}

```ts
prune(): Promise<readonly string[]>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:311](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L311)

Reclaims checkouts nobody is using: session-owned ones, unfinished ones (`building`), and writable checkouts whose held branch no longer exists. Persistent-ownership finished ones are kept.
Also reclaims orphan table sets with no registration row (US-314 B2.6): shadow tables, holding keys on branches, or activation state rows still exist, but the registration row is gone.

#### Returns

`Promise`&lt;readonly `string`[]&gt;

Ids of the reclaimed checkouts; orphan table sets have no id, so their table set suffix (`wt_…`) is returned

#### Throws

AggregateError some checkouts could not be reclaimed; the rest are reclaimed as usual

#### Remarks

Only touches checkouts whose locks it can get: checkouts open or claimed in another tab (or this one) have their locks held by them. Before deleting a database, connect to the snapshot database once with an empty entity set;
the marker migration fails on the spot on an existing database that is not a snapshot database — so when the factory is misconfigured and points at the main database's storage, this errors instead of deleting the main database.
With no snapshot database configured, read-only checkouts are skipped (their databases cannot be connected); writable checkouts' tables are in the main database and are reclaimed as usual.
When the connection-time judgment finds orphans (same criterion, and the lock is held by nobody), the plugin runs it once after connecting, see `worktree-startup-reclaim.ts`.

---

### release() \{#release\}

```ts
release(id): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:368](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L368)

Gives up the claim on a writable checkout: if mounted on it, mounts back onto the main checkout first, then returns the lock. The table set, holding key, and registration row all stay.

#### Parameters

| Parameter | Type     | Description                                                    |
| --------- | -------- | -------------------------------------------------------------- |
| `id`      | `string` | Checkout id; does nothing when this context has not claimed it |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

A persistent-ownership one can be [WorktreeManager.mount](#mount)ed again from anywhere; a session-owned one is left to `prune()` for reclaim.

---

### remove() \{#remove\}

```ts
remove(id): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:381](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L381)

Deletes a writable checkout: if mounted on it, mounts back onto the main checkout first, then deletes the table set, releases the held branch, and deletes the registration row in one transaction.

#### Parameters

| Parameter | Type     | Description                                                         |
| --------- | -------- | ------------------------------------------------------------------- |
| `id`      | `string` | Checkout id; does nothing when the registration row is already gone |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[WorktreeUnavailableError](WorktreeUnavailableError.md) `in_use`: it is claimed elsewhere; `not_found`: it is a read-only checkout (use the view's `close()`)

#### Remarks

Uncommitted changes stay on the branch: writes in the checkout all entered that branch's change log, and switching over later still reads them (git would lose them when deleting a worktree; here they are not lost).

---

### rename() \{#rename\}

```ts
rename(id, name): Promise<Worktree>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:396](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L396)

Renames a writable checkout (GitHub Desktop's Rename…).

#### Parameters

| Parameter | Type     | Description                                                                                                       |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `id`      | `string` | Checkout id                                                                                                       |
| `name`    | `string` | New name: after trimming whitespace it must not be empty, and must not duplicate another writable checkout's name |

#### Returns

`Promise`&lt;[`Worktree`](Worktree.md)&gt;

The registration row after renaming

#### Throws

[WorktreeUnavailableError](WorktreeUnavailableError.md) `invalid_name` / `name_taken`; `not_found`: no such checkout, or it is a read-only checkout

#### Remarks

The main checkout has no registration row and cannot be renamed. The name is only a human-facing label: the table set, holding key, and lock all go by id; renaming touches none of them and requires no claim.

---

### stop() \{#stop\}

```ts
stop(): void;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:181](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L181)

**`Internal`**

Stops checkout commands and cancels not-yet-executed tasks; called by the instance destruction entry.

#### Returns

`void`
