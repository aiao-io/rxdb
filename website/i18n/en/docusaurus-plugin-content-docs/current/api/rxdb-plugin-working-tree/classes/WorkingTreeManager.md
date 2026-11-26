# WorkingTreeManager

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:137](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L137)

The entry point for the working tree and commit history (see contracts/core-api.md §1).

## Remarks

The instance is created at the moment of `use(rxDBPluginWorkingTree)` (inside the plugin constructor), regardless
of whether the database has the commit capability enabled — "does this entry point exist" is a property of the
**in-process library version**, while "can it be used" is a property of **this database**. Mixing the two would
give the same code different object shapes on two databases.

After extraction into its own package this division became even firmer: whether the entry point exists became
"is `@aiao/rxdb-plugin-working-tree` installed", still a build-time property, and without the package
`database.workingTree` is a **compile error** rather than a silent `undefined`. Mounting therefore must stay in
the plugin constructor and cannot move into `install()` — the latter runs inside `init()` and would turn the
entry point into a function of the connection epoch.

## Constructors

### Constructor

```ts
new WorkingTreeManager(rxdb, worktrees?): WorkingTreeManager;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:179](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L179)

Called by the plugin constructor, one per RxDB instance.

#### Parameters

| Parameter    | Type                                                  | Description                                                                           |
| ------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `rxdb`       | [`RxDB`](../../rxdb/classes/RxDB.md)                  | The host instance; it is the only reference the whole facade holds                    |
| `worktrees?` | [`WorktreeOptions`](../interfaces/WorktreeOptions.md) | The plugin's `worktrees` option, handed to [WorkingTreeManager.checkouts](#checkouts) |

#### Returns

`WorkingTreeManager`

#### Remarks

Holds the whole RxDB rather than fetching the local adapter here: managed members must re-resolve it
**on the spot** on every call (`#runInTransaction` goes through `localAdapter$` each time), because both
`enable()` and reconnecting swap out the adapter instance. Fetching it once at construction and storing it
would pin the facade to the first connection epoch — the symptom being that after a reconnect every command
still writes to the abandoned adapter.

## Properties

### checkouts \{#checkouts\}

```ts
readonly checkouts: WorktreeManager;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:165](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L165)

Read-only worktrees (US-313): open another branch's complete data in read-only mode without switching branches.

#### Remarks

An instance field rather than a method, for the same reason as [WorkingTreeManager.commits$](#commits): every
member on the prototype is a managed command, and prototype method names must not match `/checkout|detach/i`
(the commit suite's guard).

---

### commits$ \{#commits\}

```ts
readonly commits$: Observable<WorkingTreeCommitEvent>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L156)

Emits once each time [commit()](#commit) **actually wrote a new commit**.

#### Remarks

- **When it emits**: synchronously after the transaction commits and before `commit()`'s Promise resolves —
  after `await commit()` subscribers have definitely received it, and `listCommits()` in the callback
  definitely sees this `commitId`.
- **When it does not emit**: `ok: false` (credential conflict / CAS loss), thrown errors, idempotent replays
  of the same `operationId`, `enable()`'s baselines, `restore()` / `discard()`. Idempotent replays also return
  `ok: true`, so a subscriber judging by the return value would record the same commit twice — the whole point
  of this stream is to spare subscribers from judging.
- **Subscriber isolation**: an error thrown in a callback does not affect `commit()`'s return value or other
  subscribers; the error goes through RxJS's unhandled-error path (`config.onUnhandledError`, rethrown
  asynchronously by default).
- **Does not pass the gate**: it can be subscribed to on a non-enabled database, it just never emits. The
  stream neither `error`s nor `complete`s.

An instance field rather than a getter: the gate tests enumerate prototype members, and every one on the
prototype must be a managed command.

## Methods

### checkBranchFromCommit() \{#checkbranchfromcommit\}

```ts
checkBranchFromCommit(commitId): Promise<WorkingTreeBranchFromCommitCheck>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:470](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L470)

Judges whether a commit can be used to create a branch (US-314 phase A); writes nothing.

#### Parameters

| Parameter  | Type     | Description                              |
| ---------- | -------- | ---------------------------------------- |
| `commitId` | `string` | A commit in the current branch's history |

#### Returns

`Promise`&lt;[`WorkingTreeBranchFromCommitCheck`](../type-aliases/WorkingTreeBranchFromCommitCheck.md)&gt;

See [WorkingTreeBranchFromCommitCheck](../type-aliases/WorkingTreeBranchFromCommitCheck.md); the three rejection
causes are all **return values** with `ok: false`

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) when the database has not enabled the commit capability yet

#### Throws

CommitGraphCorruptedError when the current branch's commit graph is corrupted (FR-051)

#### Remarks

Lets the UI ask before asking for a name: for a commit that cannot be used, the dialog can state the reason
outright. The judgment is the same one as [createBranchFromCommit](#createbranchfromcommit), but the database
may have changed between the two calls, so the creating call re-judges.

---

### commit() \{#commit\}

```ts
commit(message, options): Promise<CommitResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:340](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L340)

Commits **all** uncommitted units in the current branch's working tree into history (FR-041).

#### Parameters

| Parameter | Type                                              | Description                                                                                                              |
| --------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `message` | `string`                                          | The commit message                                                                                                       |
| `options` | [`CommitOptions`](../interfaces/CommitOptions.md) | See [CommitOptions](../interfaces/CommitOptions.md); the three captured slots, author, and operation id are all required |

#### Returns

`Promise`&lt;[`CommitResult`](../type-aliases/CommitResult.md)&gt;

See [CommitResult](../type-aliases/CommitResult.md); on CAS loss it is a **return value** with `ok: false`, not an exception

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) when the database has not enabled the commit capability yet

#### Throws

CommitGraphCorruptedError when the current branch's commit graph is corrupted (FR-051)

#### Throws

[CommitValidationError](CommitValidationError.md) when the message is empty, or the working tree is clean (`empty_commit`)

#### Remarks

**Exactly two positional parameters**: no selection argument (hard decision 1), and no optional third parameter.
Writing the commit and clearing the working tree happen in **the same transaction** (FR-011, SC-007), and that
transaction is opened by [runEnabled](#runenabled) — the command body does not open its own transaction,
otherwise the enabled state read by the gate and the write would belong to two different transactions.

When a new commit was written, emits once through [commits$](#commits) before returning.

---

### commitChanges() \{#commitchanges\}

```ts
commitChanges(commitId): Promise<CommitChangeSetPage>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:405](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L405)

Reads all change units of a commit (the detail side of FR-012).

#### Parameters

| Parameter  | Type     | Description           |
| ---------- | -------- | --------------------- |
| `commitId` | `string` | The commit id to read |

#### Returns

`Promise`&lt;[`CommitChangeSetPage`](../interfaces/CommitChangeSetPage.md)&gt;

See [CommitChangeSetPage](../interfaces/CommitChangeSetPage.md); a baseline node is a **return value** with no
change units, not an exception

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) when the database has not enabled the commit capability yet

#### Throws

RxDBError when the commit does not exist

#### Remarks

The reachability criterion differs from [listCommits](#listcommits): here the immutable snapshot rows are read
directly by id, with no reachability traversal. The caller clicks a node it just saw in the reachable history;
and a dangling commit's snapshot row, when read, is still the real content from when it was written, not
fabricated — "is this commit in the current branch's history" is answered by the list side; the detail side
only answers "what did it write".

---

### createBranchFromCommit() \{#createbranchfromcommit\}

```ts
createBranchFromCommit(branchId, commitId): Promise<WorkingTreeCreateBranchFromCommitResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:497](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L497)

Creates a branch from a commit in the current branch's history (US-314 phase A); does not switch.

#### Parameters

| Parameter  | Type     | Description                              |
| ---------- | -------- | ---------------------------------------- |
| `branchId` | `string` | The new branch's id                      |
| `commitId` | `string` | A commit in the current branch's history |

#### Returns

`Promise`&lt;[`WorkingTreeCreateBranchFromCommitResult`](../type-aliases/WorkingTreeCreateBranchFromCommitResult.md)&gt;

See [WorkingTreeCreateBranchFromCommitResult](../type-aliases/WorkingTreeCreateBranchFromCommitResult.md); the three
rejection causes are all **return values** with `ok: false`

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) when the database has not enabled the commit capability yet

#### Throws

CommitGraphCorruptedError when the current branch's commit graph is corrupted (FR-051)

#### Throws

RxDBError when the branch id is unusable or a branch of the same name already exists locally or remotely,
with the same message as `createBranch()`

#### Remarks

The new branch's HEAD is this commit and its working tree is empty; switching to it reads the business tables
exactly as they were when that `commit()` finished. The current branch is untouched in every slot, and its
uncommitted changes stay where they are. Synonymous with git's `git branch <name> <commit>`; GitHub Desktop's
"Create branch from commit" switches over after creating — that step is left to the caller to follow up with
`switchBranch()`.

Two managed transactions bracket the remote duplicate check: the remote duplicate check is a network round trip,
and putting it inside a transaction would block the concurrency-1 write queue for one RTT (same as
`createBranch()`); the first transaction puts the capability gate, argument validation, and judgment before the
remote round trip, and the second, after re-judging, writes the branch row, the ref, and the working tree state
rows in the same transaction.

Writes that do not enter the change log (pulls, expiry cleanup) are not undone by the switch: if such writes
happened after the commit, the new branch carries them, consistent with today's switch-branch behavior.

---

### diff() \{#diff\}

```ts
diff(options?): Promise<WorkingTreeDiff>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:316](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L316)

The current branch's uncommitted changes relative to HEAD (FR-005).

#### Parameters

| Parameter  | Type                                                                | Description                                                 |
| ---------- | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| `options?` | [`WorkingTreeDiffOptions`](../interfaces/WorkingTreeDiffOptions.md) | Granularity, entity filtering, and pagination; all optional |

#### Returns

`Promise`&lt;[`WorkingTreeDiff`](../interfaces/WorkingTreeDiff.md)&gt;

See [WorkingTreeDiff](../interfaces/WorkingTreeDiff.md)

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) when the database has not enabled the commit capability yet

#### Remarks

**There is exactly one diff axis: `HEAD ↔ working tree`** (hard decision 2). No `from` / `to` / `ref`
arguments — those three parameters belong to a "compare any two refs" model, and v1 has no index, so a second
axis is out of the question.

Like [status](#status), it **takes no `branchId`**: uncommitted changes read from another branch can neither be
committed nor discarded once brought back, and the three captured slots are only valid for the active branch
(FR-048).

---

### discard() \{#discard\}

```ts
discard(options): Promise<WorkingTreeDiscardResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:363](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L363)

Reverts the current branch's working tree entirely back to the current HEAD (FR-016).

#### Parameters

| Parameter | Type                                                                | Description                                                                                                          |
| --------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `options` | [`WorkingTreeCredentials`](../interfaces/WorkingTreeCredentials.md) | See [WorkingTreeDiscardOptions](../type-aliases/WorkingTreeDiscardOptions.md); the three captured slots are required |

#### Returns

`Promise`&lt;[`WorkingTreeDiscardResult`](../type-aliases/WorkingTreeDiscardResult.md)&gt;

See [WorkingTreeDiscardResult](../type-aliases/WorkingTreeDiscardResult.md); on a clean working tree it is a
no-op with `discardedCount: 0`

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) when the database has not enabled the commit capability yet

#### Throws

CommitGraphCorruptedError when the current branch's commit graph is corrupted (FR-051)

#### Remarks

**Exactly one required positional parameter.** Making it optional would legitimize "when omitted, read the
revision inside this call" — an internal read always equals the current value, the CAS always hits, and
FR-031's clause about discard instantly loses its teeth.

The argument itself is **not validated here**: a non-enabled database should hear "go enable()", not
"expectedBranch cannot be empty" — the latter is meaningless on such a database.

---

### enable() \{#enable\}

```ts
enable(): Promise<CommitCapabilityInfo>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:223](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L223)

Enables this database's commit capability (idempotent).

#### Returns

`Promise`&lt;[`CommitCapabilityInfo`](../interfaces/CommitCapabilityInfo.md)&gt;

The capability state after enabling

#### Throws

BranchNotMaterializableError when any local branch cannot be materialized along the `rxdb_change` chain

#### Remarks

"Enabling" is two things, and they **must happen in the same transaction**: flipping the capability bit, and
giving every local branch its root node (FR-021/049). Split into two transactions, one crash in between leaves
the database at "enabled, but branches have no root" — from then on every `commit()` hangs a node on a rootless
branch while the database claims everything is fine. When the migration throws, the whole transaction rolls
back and the capability bit returns to disabled, so a retry faces the same starting point.

**The migration runs every time, not only on the CAS-hit call.** The capability bit's CAS only hits on the
`false → true` transition (it owns both idempotence and concurrency arbitration), but `enable()`'s semantics is
"converge the database to the shape an enabled one should have", not "flip a bit once": local branches that
appeared after the database was enabled — created by an older client, or left behind when a previous run rolled
back entirely because one branch was corrupted — can only get their roots from another `enable()` call. After
it has really run once, repeated calls are idempotent: every branch lands in `alreadyInitializedBranchIds`, and
not a single statement is issued.

**The capture runtime is installed after the transaction commits.** Installed inside the transaction, capture
would immediately start intercepting the rest of this same transaction's writes — and the root nodes
`runEnableMigration()` adds to branches are written exactly there, so the act of "enabling" itself would be
recorded as a batch of uncommitted changes. Installed after the commit, this process starts capturing from the
next write; the enabling transaction itself belongs to HEAD, not to the working tree.

When the migration throws, the whole transaction rolls back and the capability bit returns to disabled;
`transaction()` then throws upward, the install line is never reached — leaving no "not enabled but capturing"
shape behind.

---

### enableIfEmpty() \{#enableifempty\}

```ts
enableIfEmpty(): Promise<WorkingTreeEnableIfEmptyResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:266](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L266)

Automatically enables when the database is empty; writes nothing when it already has content
(the auto-initialization entry point at app startup).

#### Returns

`Promise`&lt;[`WorkingTreeEnableIfEmptyResult`](../type-aliases/WorkingTreeEnableIfEmptyResult.md)&gt;

See [WorkingTreeEnableIfEmptyResult](../type-aliases/WorkingTreeEnableIfEmptyResult.md)

#### Throws

BranchNotMaterializableError when any local branch cannot be materialized along the `rxdb_change` chain
(only happens after the "empty" check passes and the enable migration starts, same shape as [enable](#enable))

#### Remarks

**The "empty" criterion is a zero `rxdb_change` row count.** Every local entity write appends a change row
(the data source for undo/redo); sync pulls go through disableTriggers and produce no rows; zero rows ⟺ this
database has never had user content. The criterion does not use user entity row counts: the plugin does not
know the entity list the app registers, and counting every entity's table would push "what counts as content"
onto every caller.

**The emptiness check, the capability flip, and the baseline seeding happen in the same transaction.** Split
apart, another writer could land the first batch of content between the check and the enable, and auto-enable
would fold brand-new user data into the baseline — while the entire point of this rule is "do not make this
decision for the user when there is content".

**The three outcomes have clearly divided responsibilities.** `already_enabled` reports as-is and does not run
the enable migration: converging the database to the enabled shape is [enable](#enable)'s semantics (its TSDoc
promises roots are backfilled on repeated calls), and this method only answers "should we enable"; when
`not_empty` returns, the capability bit is still off, and a manual `enable()` faces the same starting point.
The capture runtime is installed as usual after the two enabling outcomes, consistent with `enable()`'s
idempotent repeated-call behavior; `not_empty` does not install it — this process is not enabled, and
installing would mean starting capture on a non-enabled database.

**A missing capability row still throws** (`readCommitCapability` throws it), rather than continuing as "not
enabled and empty": that is the corruption scene of the `0004` migration not having finished, and auto-enable
would bury the corruption as a normal startup.

---

### isEnabled() \{#isenabled\}

```ts
isEnabled(): Promise<boolean>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:193](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L193)

Has this database enabled the commit capability.

#### Returns

`Promise`&lt;`boolean`&gt;

Returns `true` when enabled

#### Remarks

Along with [enable](#enable) / [enableIfEmpty](#enableifempty), one of the only three members usable on a
non-enabled database, which is why it does **not** go through [runEnabled](#runenabled) — going through it
would make "only an enabled database can check whether it is enabled".

---

### listCommits() \{#listcommits\}

```ts
listCommits(options?): Promise<CommitLogPage>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:384](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L384)

The commit history reachable from the current branch's HEAD along the full parent chain (FR-012).

#### Parameters

| Parameter  | Type                                                    | Description                                                  |
| ---------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| `options?` | [`CommitLogOptions`](../interfaces/CommitLogOptions.md) | Entry limit, time window, and entity filtering; all optional |

#### Returns

`Promise`&lt;[`CommitLogPage`](../interfaces/CommitLogPage.md)&gt;

See [CommitLogPage](../interfaces/CommitLogPage.md); a database that has never committed is a page with empty `entries`

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) when the database has not enabled the commit capability yet

#### Throws

RxDBError when the current branch's ref row is missing (`0004` did not finish; not an empty history)

#### Remarks

Like [status](#status) / [diff](#diff), it **takes no `branchId`**: what is read is always the current active
branch (FR-048). Another branch's history, once brought back, can neither be committed on nor discarded, and
"which branch we are on" is uniquely determined by the active branch — adding a parameter would let the caller
ask about an object it cannot act on.

History ≠ the whole `rxdb_commit` table: commits lost to CAS and nodes left behind by deleted branches still
have rows, but no ref points at them. The reachability traversal is in `commit/list-commits.ts`; translation
into public entries is in `commit/commit-log.ts`.

---

### restore() \{#restore\}

```ts
restore(target, options): Promise<WorkingTreeRestoreResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:429](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L429)

Writes the contents of a reachable historical commit back into the current working tree as new uncommitted
changes (FR-013).

#### Parameters

| Parameter | Type                                                                    | Description                                                                                                          |
| --------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `target`  | [`WorkingTreeRestoreTarget`](../interfaces/WorkingTreeRestoreTarget.md) | See [WorkingTreeRestoreTarget](../interfaces/WorkingTreeRestoreTarget.md); default `entities` means the whole commit |
| `options` | [`WorkingTreeCredentials`](../interfaces/WorkingTreeCredentials.md)     | See [WorkingTreeRestoreOptions](../type-aliases/WorkingTreeRestoreOptions.md); the three captured slots are required |

#### Returns

`Promise`&lt;[`WorkingTreeRestoreResult`](../type-aliases/WorkingTreeRestoreResult.md)&gt;

See [WorkingTreeRestoreResult](../type-aliases/WorkingTreeRestoreResult.md); unreachable / dirty working tree /
incompatible are all **return values** with `ok: false`

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) when the database has not enabled the commit capability yet

#### Throws

CommitGraphCorruptedError when the current branch's commit graph is corrupted (FR-051)

#### Remarks

**Exactly two required positional parameters**, the same shape as [commit](#commit). Making `options` optional
would legitimize "when omitted, read the revision inside this call" — an internal read always equals the
current value and the CAS always hits — and FR-034's clause about restore instantly loses its teeth.

**No `checkout()`, and no detached HEAD** (hard decision 5): this member is "move historical content into the
working tree", not "move HEAD over". After a restore the working tree is dirty, and the next step is `commit()`
or `discard()`, the same path as hand-written changes (FR-015).

---

### restoreSession() \{#restoresession\}

```ts
restoreSession(): Promise<
  | WorkingTreeRestoreSessionInfo
  | null>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:451](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L451)

The current branch's restore session that has not ended yet (contracts/core-api.md §5).

#### Returns

`Promise`&lt;
\| [`WorkingTreeRestoreSessionInfo`](../interfaces/WorkingTreeRestoreSessionInfo.md)
\| `null`&gt;

See [WorkingTreeRestoreSessionInfo](../interfaces/WorkingTreeRestoreSessionInfo.md); `null` when there is no unfinished session

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) when the database has not enabled the commit capability yet

#### Remarks

Like [status](#status) / [listCommits](#listcommits), it **takes no `branchId`**: the session always belongs to
the current active branch (FR-048). A restore session from another branch, once brought back, can neither be
committed on nor discarded.

"Is it still valid" is not answered here: that is `status()`'s `restoring` / `conflicted` bits, and there is
only one judgment. This member only answers "is there one, and from which commit".

---

### runEnabled() \{#runenabled\}

```ts
protected runEnabled<T>(run, signal?): Promise<T>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:569](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L569)

The **single** entry point for managed members: open a write transaction, pass the capability gate, then run
the command body.

#### Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

#### Parameters

| Parameter | Type                                            | Description                                                                                                                                                        |
| --------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `run`     | (`executor`, `adapter`) => `Promise`&lt;`T`&gt; | The command body; the executor it receives is the same one the gate used to read the capability row, and the second parameter is the current epoch's local adapter |
| `signal?` | `AbortSignal`                                   | -                                                                                                                                                                  |

#### Returns

`Promise`&lt;`T`&gt;

The command body's return value

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) when not enabled

#### Throws

RxDBError when the capability row is missing (the `0004` migration did not write it)

#### Throws

UnsupportedRxDBSystemVersionError when the capability version triple does not match this process

#### Remarks

Every step in this order has a reason:

1. **Open the transaction first.** The enabled state the gate reads and the command body's writes must enter
   and leave together, otherwise between them sits a window in which someone else could `disable` (v1 has no
   disable yet, but this window should not be closed by relying on "nobody can use it for now").
2. **Read the capability row**, and let `readCommitCapability()` throw when the row is missing. A missing row
   is the corruption scene of "the table was created but the row was not", not the disabled state; treating it
   as disabled would make the user think one click of `enable()` fixes it, while that CAS would run against an
   empty table and hit zero rows.
3. **Not-enabled comes before version comparison.** A database that is not enabled yet should hear "go
   enable()", not "your codec version is 1 and this process needs 2" — the latter gives it nothing actionable.
4. **Version comparison reuses `assertSupportedCommitCapability()`** rather than writing the comparison again
   here. Two copies of the comparison logic would inevitably diverge at some bump, and fail-closed behavior
   depends precisely on them agreeing.
5. **After the commit, run one capture self-heal** (`#healCapture()`, see its own @remarks for why). It sits
   **outside** the transaction, for the same reason as the one in `enable()`: installed inside the transaction,
   capture would start intercepting the rest of this same transaction's writes.
6. **After the rollback, add one corruption latch** (`latchBranchCorruption()`). All three paths — `commit()` /
   `restore()` / `discard()` — run `assertCommitGraphIntact()` inside this transaction, and the transaction
   that hits corruption is doomed to roll back — a marker written inside it is gone the moment it is written.
   So have each of the three paths catch once? Those three catches would miss a fourth when the next managed
   member is added. Placed on the single entry point, new members **naturally** carry this latch.

That catch does exactly one thing and then rethrows the original error **unchanged**: errors it does not
recognize are not altered in the slightest (`latchBranchCorruption` judges the type itself), and a failure of
the latching step is never allowed to replace the real error in hand.

No longer goes through `#runInTransaction()`, even though the first three lines are verbatim identical: the
self-heal needs **the very adapter this transaction used**, and that method only hands back the command body's
return value. Going through `localAdapter$` again could fetch an instance from another epoch — installing hooks
on that one would leave this epoch still not capturing.

A managed member's **argument validation must be written inside `run`**: written before the `runEnabled()`
call, a non-enabled database would first answer "message cannot be empty" — a question that is meaningless on
such a database.

**The adapter is handed down as the second parameter, instead of letting the command body resolve it again.**
It is needed by the commit write path's at-rest judgment slot (`createCommitWriteContext()`, FR-038); a command
body going through `rxdb.localAdapterSync` itself would throw immediately on a disconnected database, and going
through `localAdapter$` again could fetch an instance from **another epoch** — that instance's judger and this
transaction write to two different databases. It only costs one extra parameter: callbacks with fewer parameters
are still assignable in TS, so members that do not need it do not have to change a single word.

---

### status() \{#status\}

```ts
status(): Promise<WorkingTreeStatus>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:298](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L298)

The current branch's working tree summary (FR-004).

#### Returns

`Promise`&lt;[`WorkingTreeStatus`](../interfaces/WorkingTreeStatus.md)&gt;

See [WorkingTreeStatus](../interfaces/WorkingTreeStatus.md)

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) when the database has not enabled the commit capability yet

#### Remarks

**Zero parameters**: the summary asks "how is the current branch doing right now", and "the current branch" is
uniquely determined by the active branch (FR-048). Adding a `branchId` parameter would let the caller ask about
another branch, whose `workingTreeRevision`, once brought back, can neither be committed nor discarded — the
three captured slots are only valid for the active branch.
