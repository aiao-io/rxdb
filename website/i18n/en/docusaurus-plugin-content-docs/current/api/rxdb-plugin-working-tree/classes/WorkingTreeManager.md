# WorkingTreeManager

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:137](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L137)

Entry point for the working tree and commit history (contract in contracts/core-api.md §1).

## Remarks

The instance is built at the moment of `use(rxDBPluginWorkingTree)` (inside the plugin constructor), independent of whether the database has commit capability enabled —
"does this entry exist" is a property of the **in-process database version**, while "can it be used" is a property of **this database**.
Mixing the two would give the same code different object shapes on two databases.

After the package extraction this division becomes even harder: whether the entry exists becomes "is `@aiao/rxdb-plugin-working-tree` installed",
still a build-time property, and without the package installed `database.workingTree` is a **compile error** rather than a silent `undefined`.
The mount therefore must stay in the plugin constructor and cannot move into `install()` — the latter runs inside `init()` and would turn the entry
into a function of the connection epoch.

## Constructors

### Constructor

```ts
new WorkingTreeManager(rxdb, worktrees?): WorkingTreeManager;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:179](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L179)

Called by the plugin constructor, one per RxDB instance.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) | The host instance; the whole facade holds only this one reference |
| `worktrees?` | [`WorktreeOptions`](../interfaces/WorktreeOptions.md) | The plugin's `worktrees` option, handed to [WorkingTreeManager.checkouts](#checkouts) |

#### Returns

`WorkingTreeManager`

#### Remarks

Holds the whole RxDB instead of fetching the local adapter here: managed members re-resolve **on the spot** on every call
(`#runInTransaction` goes through `localAdapter$` every time), because `enable()` and reconnecting both swap the
adapter instance. Fetching once at construction time and storing it would pin the facade to the first connection epoch,
with the symptom that after a reconnect all commands still write to the already-discarded adapter.

## Properties

### checkouts \{#checkouts\}

```ts
readonly checkouts: WorktreeManager;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:165](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L165)

Read-only checkouts (US-313): open the complete data of another branch read-only without switching branches.

#### Remarks

An instance field rather than a method, same reason as [WorkingTreeManager.commits$](#commits): members on the prototype are all managed commands,
and prototype method names must not match `/checkout|detach/i` (the commit suite's guard).

***

### commits$ \{#commits\}

```ts
readonly commits$: Observable<WorkingTreeCommitEvent>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L156)

Emits once each time [commit()](#commit) **actually wrote a new commit**.

#### Remarks

- **When it emits**: after the transaction commits and before `commit()`'s Promise resolves, emitted synchronously — after `await commit()`
  the subscriber has definitely received it, and `listCommits()` in the callback definitely reads this `commitId`.
- **When it does not emit**: `ok: false` (credential conflict / CAS failure), thrown errors, idempotent replay of the same `operationId`,
  `enable()`'s baseline, `restore()` / `discard()`. Idempotent replay also returns `ok: true`; a subscriber judging by the return value
  would record the same commit twice — this stream exists precisely so subscribers do not need to judge themselves.
- **Subscriber isolation**: an error thrown in a callback does not affect `commit()`'s return value nor other subscribers; errors go through RxJS's
  unhandled error path (`config.onUnhandledError`, async rethrow by default).
- **Does not pass the gate**: can be subscribed on a non-enabled database, it just never emits. The stream neither `error`s nor `complete`s.

An instance field rather than a getter: the gate tests enumerate prototype members, and every one on the prototype must be a managed command.

## Methods

### checkBranchFromCommit() \{#checkbranchfromcommit\}

```ts
checkBranchFromCommit(commitId): Promise<WorkingTreeBranchFromCommitCheck>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:470](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L470)

Judges whether a commit can be used to create a branch (US-314 phase A); writes nothing.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `commitId` | `string` | A commit in the current branch's history |

#### Returns

`Promise`&lt;[`WorkingTreeBranchFromCommitCheck`](../type-aliases/WorkingTreeBranchFromCommitCheck.md)&gt;

See [WorkingTreeBranchFromCommitCheck](../type-aliases/WorkingTreeBranchFromCommitCheck.md); the three rejection causes are `ok: false` **return values**

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) this database has not enabled commit capability

#### Throws

CommitGraphCorruptedError the current branch's commit graph is corrupted (FR-051)

#### Remarks

Lets the UI ask once before asking for a name: for a commit that cannot be branched from, the dialog states the reason directly. The judgment is the same one as in [createBranchFromCommit](#createbranchfromcommit),
but the database may have changed between the two calls, and the creating call re-judges.

***

### commit() \{#commit\}

```ts
commit(message, options): Promise<CommitResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:340](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L340)

Commits **all** uncommitted units in the current branch's working tree into history (FR-041).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `message` | `string` | Commit message |
| `options` | [`CommitOptions`](../interfaces/CommitOptions.md) | See [CommitOptions](../interfaces/CommitOptions.md); the three captured positions plus author and operation id are all required |

#### Returns

`Promise`&lt;[`CommitResult`](../type-aliases/CommitResult.md)&gt;

See [CommitResult](../type-aliases/CommitResult.md); a CAS failure is an `ok: false` **return value**, not an exception

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) this database has not enabled commit capability

#### Throws

CommitGraphCorruptedError the current branch's commit graph is corrupted (FR-051)

#### Throws

[CommitValidationError](CommitValidationError.md) the message is empty, or the working tree is clean (`empty_commit`)

#### Remarks

**Exactly two positional parameters**: no selection parameter (hard decision 1), and no optional third parameter.
Writing the commit and clearing the working tree happen in the **same transaction** (FR-011, SC-007), and that transaction is opened by
[runEnabled](#runenabled) — the command body does not open its own transaction, otherwise the enabled state read by the gate and the writes would belong to two transactions.

When a new commit is written, emits once via [commits$](#commits) before returning.

***

### commitChanges() \{#commitchanges\}

```ts
commitChanges(commitId): Promise<CommitChangeSetPage>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:405](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L405)

Reads all change units of one commit (the detail side of FR-012).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `commitId` | `string` | The commit id to read |

#### Returns

`Promise`&lt;[`CommitChangeSetPage`](../interfaces/CommitChangeSetPage.md)&gt;

See [CommitChangeSetPage](../interfaces/CommitChangeSetPage.md); a baseline node is a **return value** with no change units, not an exception

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) this database has not enabled commit capability

#### Throws

RxDBError when this commit does not exist

#### Remarks

A different reachability criterion from [listCommits](#listcommits): here the immutable snapshot rows are read directly by id, with no reachability traversal.
The caller clicks on a node it just saw in the reachable history; and a dangling commit's snapshot row reads back as its true content
at write time, not something fabricated — "is this commit in the current branch's history" is answered by the list side,
the detail side only answers "what did it write".

***

### createBranchFromCommit() \{#createbranchfromcommit\}

```ts
createBranchFromCommit(branchId, commitId): Promise<WorkingTreeCreateBranchFromCommitResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:497](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L497)

Creates a branch from a commit in the current branch's history (US-314 phase A); does not switch.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `branchId` | `string` | Id of the new branch |
| `commitId` | `string` | A commit in the current branch's history |

#### Returns

`Promise`&lt;[`WorkingTreeCreateBranchFromCommitResult`](../type-aliases/WorkingTreeCreateBranchFromCommitResult.md)&gt;

See [WorkingTreeCreateBranchFromCommitResult](../type-aliases/WorkingTreeCreateBranchFromCommitResult.md); the three rejection causes are `ok: false` **return values**

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) this database has not enabled commit capability

#### Throws

CommitGraphCorruptedError the current branch's commit graph is corrupted (FR-051)

#### Throws

RxDBError when the branch id is unusable, or a branch with the same name already exists locally or remotely; same message as `createBranch()`

#### Remarks

The new branch's HEAD is this commit and its working tree is empty; switching to it reads the business tables exactly as they were when that `commit()` finished; the current branch is not touched at all,
and its uncommitted changes stay in place. Same meaning as git's `git branch <name> <commit>`; GitHub Desktop's "Create branch from commit"
switches over after creating — that step is the caller following up with `switchBranch()`.

Two managed transactions sandwich the remote duplicate check: the remote duplicate check is a network round trip, and putting it inside the transaction would block the concurrency-1 write queue for one RTT (same as `createBranch()`);
the first transaction puts the capability gate, parameter validation, and the judgment before the remote round trip; the second transaction re-judges and then writes the branch row, the ref, and the two working tree state rows in the same transaction.

Writes that do not enter the log (pulls, expiration cleanup) are not undone on switch: if such writes happened after the commit, the new branch carries them, consistent with today's switch-branch behavior.

***

### diff() \{#diff\}

```ts
diff(options?): Promise<WorkingTreeDiff>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:316](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L316)

The current branch's uncommitted changes relative to HEAD (FR-005).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`WorkingTreeDiffOptions`](../interfaces/WorkingTreeDiffOptions.md) | Granularity, entity filter, and pagination; all optional |

#### Returns

`Promise`&lt;[`WorkingTreeDiff`](../interfaces/WorkingTreeDiff.md)&gt;

See [WorkingTreeDiff](../interfaces/WorkingTreeDiff.md)

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) this database has not enabled commit capability

#### Remarks

**Only one diff axis: `HEAD ↔ working tree`** (hard decision 2). No `from` / `to` / `ref` parameters —
those three parameters belong to the "compare any two refs" model, and v1 has no index, so there is no second axis to speak of.

Like [status](#status), it does **not take `branchId`**: uncommitted changes of another branch cannot be committed
or discarded once fetched; the three captured positions are only valid for the active branch (FR-048).

***

### discard() \{#discard\}

```ts
discard(options): Promise<WorkingTreeDiscardResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:363](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L363)

Reverts the current branch's entire working tree back to the current HEAD (FR-016).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`WorkingTreeCredentials`](../interfaces/WorkingTreeCredentials.md) | See [WorkingTreeDiscardOptions](../type-aliases/WorkingTreeDiscardOptions.md); the three captured positions are required |

#### Returns

`Promise`&lt;[`WorkingTreeDiscardResult`](../type-aliases/WorkingTreeDiscardResult.md)&gt;

See [WorkingTreeDiscardResult](../type-aliases/WorkingTreeDiscardResult.md); on a clean working tree it is a no-op with `discardedCount: 0`

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) this database has not enabled commit capability

#### Throws

CommitGraphCorruptedError the current branch's commit graph is corrupted (FR-051)

#### Remarks

**Exactly one required positional parameter.** Making it optional would make "read the revision internally when omitted" a
legal usage — what is read internally always equals the current value, the CAS always hits, and FR-031's half-sentence about discard is void on the spot.

The parameter itself is **not validated here**: a non-enabled database should hear "go call enable()", not
"expectedBranch cannot be empty" — the latter is meaningless on this database.

***

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

"Enabling" is two things, and they **must be in the same transaction**: flipping the capability bit, and adding a root node to each local branch
(FR-021/049). Split into two transactions, one crash in between would leave "enabled, but the branch has no root" — from then on every
`commit()` hangs nodes onto a rootless branch while the database claims everything is fine. When the migration throws, the whole transaction rolls back and the capability bit
returns to not-enabled, so a retry faces the same starting point.

**The migration runs every time, not only on the CAS-hitting call.** The capability bit's CAS only hits on the `false → true` call
(it handles idempotency and concurrency arbitration), but `enable()`'s semantics are "converge the database to the shape an enabled database should have",
not "flip the bit once": local branches that appeared after enabling — created by old-version clients, or left after a previous full rollback due to some branch's
corruption — can only get roots by calling `enable()` again. After it has really run once, repeated calls are idempotent,
all branches land in `alreadyInitializedBranchIds`, and not one statement is issued.

**The capture runtime is installed after the transaction commits.** Installed inside the transaction, capture would immediately start intercepting the remaining writes of the same
transaction — and the root nodes `runEnableMigration()` adds to the branches are written exactly in there, so the "enabling" act
itself would be recorded as a batch of uncommitted changes. Installed after commit, this process starts capturing from its next write; this enabling act
belongs to HEAD, not to the working tree.

When the migration throws, the whole transaction rolls back and the capability bit returns to not-enabled; at that point `transaction()` rethrows upward, and the install line
is never reached — the shape "not enabled yet capturing" cannot remain.

***

### enableIfEmpty() \{#enableifempty\}

```ts
enableIfEmpty(): Promise<WorkingTreeEnableIfEmptyResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:266](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L266)

Auto-enables when the database is empty; writes nothing when it already has content (the auto-initialization entry at app startup).

#### Returns

`Promise`&lt;[`WorkingTreeEnableIfEmptyResult`](../type-aliases/WorkingTreeEnableIfEmptyResult.md)&gt;

See [WorkingTreeEnableIfEmptyResult](../type-aliases/WorkingTreeEnableIfEmptyResult.md)

#### Throws

BranchNotMaterializableError when any local branch cannot be materialized along the `rxdb_change` chain
  (only happens after the "empty" judgment passes and the enable migration starts running, same shape as [enable](#enable))

#### Remarks

**The "empty" criterion is that the `rxdb_change` row count is zero.** Every local entity write appends one change
(the undo/redo data source); sync pull goes through disableTriggers and produces no rows; zero rows ⟺ this database
has never had user content. The criterion does not use user-entity row counts: the plugin does not know the app-registered entity list, and counting
table by table per entity would push "what counts as content" onto every caller.

**Judging empty, flipping the capability bit, and adding the baseline are in the same transaction.** Split apart, another
writer could land the first batch of content between the empty judgment and enabling, and auto-enable would fold freshly-appeared user data into the baseline — while the entire
point of this rule is "do not make this decision for the user when there is content".

**The three outcomes have clear division of labor.** `already_enabled` reports as-is and does not run the enable migration: converging the database to the shape an enabled
database should have is [enable](#enable)'s semantics (its TSDoc promises repeated calls add roots); here only answers
"should it be enabled"; when `not_empty` is returned the capability bit is still off, and a manual `enable()` faces the same starting point.
The capture runtime is installed after the two enabling outcomes as usual, consistent with `enable()`'s idempotent behavior on repeated calls;
`not_empty` does not install — this process has not enabled, and installing would mean starting capture on a non-enabled database.

**A missing capability row throws as usual** (`readCommitCapability` throws itself), not continuing as "not enabled and empty":
that is the corruption scene of the `0004` migration not finishing, and auto-enable would bury the corruption as one normal startup.

***

### isEnabled() \{#isenabled\}

```ts
isEnabled(): Promise<boolean>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:193](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L193)

Has this database enabled commit capability?

#### Returns

`Promise`&lt;`boolean`&gt;

Returns `true` when enabled

#### Remarks

Along with [enable](#enable) / [enableIfEmpty](#enableifempty), it is one of the only three members usable on a non-enabled database, so it does **not** pass
[runEnabled](#runenabled) — passing it would become "only enabled databases can query whether they are enabled".

***

### listCommits() \{#listcommits\}

```ts
listCommits(options?): Promise<CommitLogPage>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:384](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L384)

The current branch's commit history reachable from HEAD along the full parent chain (FR-012).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options?` | [`CommitLogOptions`](../interfaces/CommitLogOptions.md) | Entry limit, time window, and entity filter; all optional |

#### Returns

`Promise`&lt;[`CommitLogPage`](../interfaces/CommitLogPage.md)&gt;

See [CommitLogPage](../interfaces/CommitLogPage.md); a database that has never committed returns a page with empty `entries`

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) this database has not enabled commit capability

#### Throws

RxDBError when the current branch's ref row is missing (`0004` did not finish; not empty history)

#### Remarks

Like [status](#status) / [diff](#diff), it does **not take `branchId`**: it always reads the current active branch
(FR-048). Another branch's history cannot be committed on or discarded once fetched, and "which branch is current"
is uniquely determined by the active branch — adding a parameter would allow the caller to ask about an object it cannot act on.

History ≠ the whole `rxdb_commit` table: commits lost to CAS and nodes left by deleted branches still have rows, but no
ref points at them. The reachability traversal is in `commit/list-commits.ts`, translation into public entries in
`commit/commit-log.ts`.

***

### restore() \{#restore\}

```ts
restore(target, options): Promise<WorkingTreeRestoreResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:429](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L429)

Writes the contents of a reachable historical commit back into the current working tree as new uncommitted changes (FR-013).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `target` | [`WorkingTreeRestoreTarget`](../interfaces/WorkingTreeRestoreTarget.md) | See [WorkingTreeRestoreTarget](../interfaces/WorkingTreeRestoreTarget.md); with `entities` omitted it is the whole commit |
| `options` | [`WorkingTreeCredentials`](../interfaces/WorkingTreeCredentials.md) | See [WorkingTreeRestoreOptions](../type-aliases/WorkingTreeRestoreOptions.md); the three captured positions are required |

#### Returns

`Promise`&lt;[`WorkingTreeRestoreResult`](../type-aliases/WorkingTreeRestoreResult.md)&gt;

See [WorkingTreeRestoreResult](../type-aliases/WorkingTreeRestoreResult.md); unreachable / dirty working tree / incompatible are all `ok: false` **return values**

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) this database has not enabled commit capability

#### Throws

CommitGraphCorruptedError the current branch's commit graph is corrupted (FR-051)

#### Remarks

**Exactly two required positional parameters**, same shape as [commit](#commit). Making `options` optional would make "read the revision internally when omitted"
a legal usage, and what is read internally always equals the current value and the CAS always hits — FR-034's half-sentence about restore
is void on the spot.

**No `checkout()`, and no detached HEAD** (hard decision 5): this member "moves historical content into the working tree",
it does not "move HEAD over". After restore the working tree is dirty; the next step is `commit()` or `discard()`, the same path as hand-written changes
(FR-015).

***

### restoreSession() \{#restoresession\}

```ts
restoreSession(): Promise<
  | WorkingTreeRestoreSessionInfo
  | null>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:451](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L451)

The current branch's not-yet-finished restore session (contracts/core-api.md §5).

#### Returns

`Promise`&lt;
  \| [`WorkingTreeRestoreSessionInfo`](../interfaces/WorkingTreeRestoreSessionInfo.md)
  \| `null`&gt;

See [WorkingTreeRestoreSessionInfo](../interfaces/WorkingTreeRestoreSessionInfo.md); `null` when there is no unfinished session

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) this database has not enabled commit capability

#### Remarks

Like [status](#status) / [listCommits](#listcommits), it does **not take `branchId`**: the session always belongs to the current active branch
(FR-048). A restore session on another branch cannot be committed on or discarded once fetched.

"Whether it still holds" is not answered here: that is the `restoring` / `conflicted` two bits of `status()`, and the judgment exists only there.
This member only answers "is there one, and from which commit".

***

### runEnabled() \{#runenabled\}

```ts
protected runEnabled<T>(run, signal?): Promise<T>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts:569](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L569)

The **only** entry of managed members: opens a write transaction, passes the capability gate, then runs the command body.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `run` | (`executor`, `adapter`) => `Promise`&lt;`T`&gt; | The command body; the executor it receives is the same one the gate reads the capability row with; the second parameter is this epoch's local adapter |
| `signal?` | `AbortSignal` | - |

#### Returns

`Promise`&lt;`T`&gt;

The command body's return value

#### Throws

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) when not enabled

#### Throws

RxDBError when the capability row is missing (the `0004` migration did not write that row)

#### Throws

UnsupportedRxDBSystemVersionError when the capability version triple does not match this process

#### Remarks

The order of the steps all has reasons:

1. **Open the transaction first.** The enabled state read by the gate and the command body's writes must enter and exit together, otherwise between them sits
   a window in which someone else could `disable` (v1 has no disable yet, but this window should not be closed by "nobody can use it for now").
2. **Read the capability row**, and let `readCommitCapability()` throw itself when the row is missing. A missing row is the corruption scene of "tables created but without
   that row", not the off state; treating it as off would let the user think one click of `enable()` fixes it, while that CAS would hit an empty table and match 0 rows.
3. **Not-enabled comes before version comparison.** A not-yet-enabled database most needs to hear "go call enable()",
   not "your codec version is 1 and this process needs 2" — the latter is not actionable for it at all.
4. **Version comparison reuses `assertSupportedCommitCapability()`**, not writing the comparison again here.
   Two copies of comparison logic will eventually diverge at some bump, and fail-closed relies exactly on them agreeing.
5. **After commit, one capture self-heal** (`#healCapture()`, reason in its own @remarks).
   It sits **outside** the transaction, same reason as the one line in `enable()`: installed inside the transaction,
   capture would start intercepting the remaining writes of the same transaction.
6. **After rollback, one corruption latch** (`latchBranchCorruption()`). The three paths `commit()` / `restore()` /
   `discard()` all run `assertCommitGraphIntact()` in this transaction, and the transaction that hits corruption
   is doomed to roll back — a mark written inside is gone as soon as it is written. So each of the three paths catches once? Those three catches
   would miss the fourth when the next managed member is added. Put on the only entry, new members **naturally** carry this latch.

That catch patches exactly one thing and then rethrows the original error **as-is**: errors it does not recognize are not changed by one word (`latchBranchCorruption`
judges the type itself), and a failure of the marking step is never allowed to replace the real error at hand.

No longer goes through `#runInTransaction()`, although its first three lines are verbatim identical: the self-heal needs **the adapter used by this transaction**,
and that method only hands out the command body's return value. Going through `localAdapter$` again may fetch an instance of another
epoch — installing hooks on that one would leave this epoch still not capturing.

Managed members' **parameter validation must be written inside `run`**: written before calling `runEnabled()`,
a non-enabled database would first answer "message cannot be empty" — a question that is meaningless on this database.

**The adapter is handed down as the second parameter, rather than letting the command body resolve it again.** What needs it is the commit write path's
at-rest judgment slot (`createCommitWriteContext()`, FR-038); the command body going through
`rxdb.localAdapterSync` itself would throw directly on a non-connected database, and going through `localAdapter$` again may fetch an instance of
**another epoch** — that instance's judger would write to a different database than this transaction. Only one parameter is added:
callbacks with fewer parameters remain assignable in TS; members that do not need it change not one word.

***

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

[WorkingTreeCapabilityDisabledError](WorkingTreeCapabilityDisabledError.md) this database has not enabled commit capability

#### Remarks

**Zero parameters**: the summary asks "how is the current branch now", and "the current branch" is uniquely determined by the active branch
(FR-048). Adding a `branchId` parameter would allow the caller to ask about other branches, while that branch's
`workingTreeRevision` cannot be committed or discarded once fetched — the three captured positions are only valid for the active branch.
