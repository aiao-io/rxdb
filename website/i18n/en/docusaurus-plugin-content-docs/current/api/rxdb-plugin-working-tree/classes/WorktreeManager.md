# WorktreeManager

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L155)

The worktree entry point: `rxdb.workingTree.checkouts`.

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

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) | The main instance |
| `runEnabled` | [`WorktreeTransactionRunner`](../type-aliases/WorktreeTransactionRunner.md) | The facade's managed transaction; all main-database transactions pass through its gate |
| `options` | [`WorktreeOptions`](../interfaces/WorktreeOptions.md) \| `undefined` | The plugin's `worktrees` option |

#### Returns

`WorktreeManager`

## Methods

### add() \{#add\}

```ts
add(branchId, options?): Promise<Worktree>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:332](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L332)

Opens a writable worktree: registration, holding the branch, creating the shadow table set, and seeding are
all done in one main-database transaction; it is not mounted after creation, this context claims it.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `branchId` | `string` | The branch to check out into the worktree; it must be fully available locally |
| `options?` | [`WorktreeAddOptions`](../interfaces/WorktreeAddOptions.md) | See [WorktreeAddOptions](../interfaces/WorktreeAddOptions.md) |

#### Returns

`Promise`&lt;[`Worktree`](Worktree.md)&gt;

The registration row

#### Throws

[WorktreeUnavailableError](WorktreeUnavailableError.md) `unsupported_adapter`: the main database's adapter cannot
create a table set; `branch_not_found` / `branch_not_materialized`; `invalid_name` / `name_taken`: the given
name is empty or already used by another writable worktree; the runtime has no Web Locks (`locks_unavailable`)

#### Throws

WorktreeBranchHeldError when the branch is already held: the main worktree is currently on it, or another
writable worktree holds it (git: `already used by worktree`)

#### Remarks

Seeding = copying the main table set's rows verbatim, then applying the "branch the main worktree is on →
this branch" delta, row-for-row identical to what a switch would read; neither enters the change log. The
activation state is not advanced: the main worktree's working tree, current branch, and `activationRevision`
are untouched; this table set's own activation state row is created in the same transaction (switching
branches inside the worktree only advances it, B2.2). When no name is given the branch id is used, with
`-2`, `-3` appended if taken. GitHub Desktop switches over after creating, which corresponds to
[WorktreeManager.mount](#mount).

***

### attach() \{#attach\}

```ts
attach(id): Promise<WorktreeView>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:235](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L235)

Reopens a persistently owned worktree without rebuilding the snapshot.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The worktree id (the row in [WorktreeManager.list](#list)) |

#### Returns

`Promise`&lt;[`WorktreeView`](../interfaces/WorktreeView.md)&gt;

The open view

#### Throws

[WorktreeUnavailableError](WorktreeUnavailableError.md) `in_use`: it is currently open elsewhere; `not_found`:
there is no such persistent, fully-built worktree, or the registration row remains but the snapshot database
is already gone (the registration row is reclaimed along the way); `schema_mismatch`: the app's entity
structure changed after it was built — open a new one instead

***

### dispose() \{#dispose\}

```ts
dispose(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L187)

**`Internal`**

Waits for in-flight commands to finish and returns all writable worktree claim locks; called after the
adapter disconnects.

#### Returns

`Promise`&lt;`void`&gt;

***

### list() \{#list\}

```ts
list(): Promise<Worktree[]>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:289](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L289)

All worktrees registered in this database, sorted by registration time.

#### Returns

`Promise`&lt;[`Worktree`](Worktree.md)[]&gt;

The registration rows

***

### mount() \{#mount\}

```ts
mount(id): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:351](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L351)

Mounts a writable worktree onto the main instance: from then on reads and writes land on that shadow table
set, and captures and commits are recorded on the branch it holds.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The worktree id (the row in [WorktreeManager.list](#list)) |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[WorktreeUnavailableError](WorktreeUnavailableError.md) `in_use`: it is claimed elsewhere; `not_found`: it is
not a fully-built writable worktree, or the branch it holds no longer exists; `schema_rebuild_failed`: the
fingerprint mismatches and the rebuild under the new structure failed (the whole transaction rolls back and
the worktree is left as-is; `cause` is the original error)

#### Remarks

If not already claimed, claim it first (take its lock), and return the lock if it cannot be mounted.
Switching the mount switches the whole instance: the entity cache is cleared, all live queries re-run, and
the undo stack follows over to that branch. When already mounted on it and no rebuild is needed, nothing happens.

The registration row records the fingerprint of this table set from when it was opened (the member entities'
structure combined with the fingerprint of plugin table-set-creation hooks, `RxDB.worktreeTableSetFingerprint`).
When an app upgrade changes entities, or a plugin's table-attached auxiliary objects change, the fingerprint no
longer matches: the whole set is rebuilt under the new structure inside the mounting transaction (US-314 B2.6),
see `#rebuild`.

***

### mountMain() \{#mountmain\}

```ts
mountMain(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:356](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L356)

Mounts the main instance back onto the main worktree; writable worktrees that are claimed stay claimed.

#### Returns

`Promise`&lt;`void`&gt;

***

### open() \{#open\}

```ts
open(target, options?): Promise<WorktreeView>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:205](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L205)

Opens another branch's, or a reachable commit on the current branch's, complete data in read-only mode; does
not switch branches or touch the working tree.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `target` | [`WorktreeTarget`](../type-aliases/WorktreeTarget.md) | `{ branchId }` for a branch view, `{ commitId }` for a commit view |
| `options?` | [`WorktreeOpenOptions`](../interfaces/WorktreeOpenOptions.md) | See [WorktreeOpenOptions](../interfaces/WorktreeOpenOptions.md) |

#### Returns

`Promise`&lt;[`WorktreeView`](../interfaces/WorktreeView.md)&gt;

The open view; [WorktreeView.close](../interfaces/WorktreeView.md#close) when done

#### Throws

[WorktreeUnavailableError](WorktreeUnavailableError.md) when no snapshot database is configured, the backend is
unsupported, or the runtime has no Web Locks; when the branch does not exist or only metadata is available
locally; when the commit is unreachable, the path contains unrecognized entities, or there is a restore in
progress (same criterion as `restore()`)

***

### prune() \{#prune\}

```ts
prune(): Promise<readonly string[]>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:311](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L311)

Reclaims worktrees nobody is using: session-owned ones, unbuilt ones (`building`), and writable worktrees
whose held branch no longer exists. Persistently owned, fully-built ones are kept. Also reclaims orphan table
sets with no registration row (US-314 B2.6): the shadow tables, the holding key on the branch, or the
activation state row are still there, but the registration row is gone.

#### Returns

`Promise`&lt;readonly `string`[]&gt;

The ids of the reclaimed worktrees; orphan table sets have no id, so their table set suffixes (`wt_…`) are
returned instead

#### Throws

AggregateError when some worktrees failed to be reclaimed; the rest are reclaimed as usual

#### Remarks

Only touches worktrees whose locks it can get: those open or claimed by another tab (or this page) hold their
own locks. Before deleting a database, the snapshot database is connected once with an empty entity set — the
marker migration fails on the spot for an existing database that is not a snapshot database — so when the
factory is misconfigured and points at the main database's storage, this errors out instead of deleting the
main database. When no snapshot database is configured, read-only worktrees are skipped (their databases
cannot be connected); writable worktrees' tables live in the main database and are reclaimed as usual. When
orphans are detected at connection time (same criterion, and nobody holds the lock), the plugin runs one pass
right after connecting, see `worktree-startup-reclaim.ts`.

***

### release() \{#release\}

```ts
release(id): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:368](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L368)

Gives up the claim on a writable worktree: if mounted on it, mounts back onto the main worktree first, then
returns the lock. The table set, holding key, and registration row all stay.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The worktree id; a no-op when this context has not claimed it |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

A persistently owned one can be [WorktreeManager.mount](#mount)ed again from anywhere afterwards; a
session-owned one is left for `prune()` to reclaim.

***

### remove() \{#remove\}

```ts
remove(id): Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:381](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L381)

Deletes a writable worktree: if mounted on it, mounts back onto the main worktree first, then deletes the
table set, releases the held branch, and removes the registration row in one transaction.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The worktree id; a no-op when the registration row is already gone |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[WorktreeUnavailableError](WorktreeUnavailableError.md) `in_use`: it is claimed elsewhere; `not_found`: it is
a read-only worktree (use the view's `close()`)

#### Remarks

Uncommitted changes stay on the branch: writes inside the worktree all entered that branch's change log, and
switching over later still reads them (git loses them when a worktree is deleted; here they are not).

***

### rename() \{#rename\}

```ts
rename(id, name): Promise<Worktree>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:396](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L396)

Renames a writable worktree (GitHub Desktop's Rename…).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The worktree id |
| `name` | `string` | The new name: must not be empty after trimming leading/trailing whitespace, and must not clash with another writable worktree |

#### Returns

`Promise`&lt;[`Worktree`](Worktree.md)&gt;

The registration row after renaming

#### Throws

[WorktreeUnavailableError](WorktreeUnavailableError.md) `invalid_name` / `name_taken`; `not_found`: there is no
such worktree, or it is a read-only worktree

#### Remarks

The main worktree has no registration row and cannot be renamed. The name is only a human-facing label: the
table set, holding key, and lock all key on the id; renaming touches none of them and requires no claim.

***

### stop() \{#stop\}

```ts
stop(): void;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts:181](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree-manager.ts#L181)

**`Internal`**

Stops the worktree commands and cancels tasks not yet executed; called by the instance disposal entry point.

#### Returns

`void`
