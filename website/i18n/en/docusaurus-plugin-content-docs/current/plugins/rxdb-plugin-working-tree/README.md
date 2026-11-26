# @aiao/rxdb-plugin-working-tree

`@aiao/rxdb-plugin-working-tree` adds **a local working tree and commit history** to `@aiao/rxdb`: "uncommitted changes" and "commit history" become first-class concepts in the database — user edits land in the working tree instead of directly mutating the main data; `status()` / `diff()` view the summary and per-unit changes; `commit()` turns them into one snapshot; `discard()` resets everything; `listCommits()` reads the current branch's commit history; `restore()` moves a historical version's content back into the working tree.

A database without this package installed costs **zero** — the twelve system tables, write capture, and commit graph encoding all ship with the package; core keeps only the mount/unmount ports and two handoff gates.

## Capabilities

| Capability                 | Description                                                                                                                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Write capture              | User edits land in the working tree instead of directly mutating the main data; the database's own bookkeeping writes (`rxdb_change` etc.) are not captured                                                                                                    |
| `status()`                 | Uncommitted summary of the current branch: entry count, the three captured revisions, origin breakdown                                                                                                                                                         |
| `diff()`                   | Per-unit uncommitted changes; `entity` / `transaction` granularity, with a paging cursor                                                                                                                                                                       |
| `commit()`                 | Commit **all** uncommitted units in the working tree as one snapshot; a CAS failure returns instead of throwing                                                                                                                                                |
| `discard()`                | Reset the whole working tree back to HEAD                                                                                                                                                                                                                      |
| `listCommits()`            | The commit history reachable from HEAD along the parent chain on the current branch                                                                                                                                                                            |
| `restore()`                | Write the content of a reachable historical commit back into the working tree as **new uncommitted changes**; does not move HEAD, does not delete history                                                                                                      |
| `restoreSession()`         | The current branch's unfinished restore session                                                                                                                                                                                                                |
| `commits$`                 | Emits `{ commitId, branchId }` once whenever `commit()` **actually wrote a new commit**, for recording/replay and other subscribers to correlate commits                                                                                                       |
| `switchBranch()`           | Switching branches can require "the current branch must be clean" and "the activation generation must match"; lives on `@aiao/rxdb-plugin-history`'s `db.versionManager`                                                                                       |
| `checkouts`                | Read-only checkouts: without switching branches or touching the working tree, open the complete data of another branch or a reachable commit on the current branch read-only (see [Read-only checkouts](#read-only-checkouts))                                 |
| `createBranchFromCommit()` | Create a branch from a commit in the current branch's history: HEAD is that commit, the working tree is empty, no switch; `checkBranchFromCommit()` asks first whether it can be created (see [Create a branch from a commit](#create-a-branch-from-a-commit)) |

## Six things to know first

These six are not a collection of caveats — they are **six places where people make wrong decisions**. They come before the usage because three of them are irreversible once data has been written.

### 1. Commit capability is a **database-level** explicit switch, not per-entity or per-branch

`db.workingTree.enable()` once, and the whole database runs with working-tree semantics from then on — all entities, all branches. There is no "only `Article` goes through the working tree" and no "enable it only on the `feature` branch".

Enabling leaves a capability watermark row in `rxdb_migration`, and **clients without this plugin refuse to connect to the database from then on** (see "The unclaimed capability guard" below). So this is not a switch you can "turn on to try": once the database is enabled, every client that accesses it must install `@aiao/rxdb-plugin-working-tree` — including other people's, older versions, and the ones you cannot control. v1 has **no `disable()`**.

### 2. The working tree ≠ the draft cache; they are different layers and do not replace each other

|                 | Working tree (this package)                                                     | Draft cache (`@aiao/rxdb-plugin-workspace`)                |
| --------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Content         | Changes **already written to the database** but not yet committed as a snapshot | The editor's **not-yet-saved** buffer                      |
| Storage         | System tables in the main database, participating in transactions               | The plugin's own IndexedDB, **never in the main database** |
| Query semantics | `find()` reads the working-tree values                                          | Queries cannot see it                                      |
| Loss impact     | The user's saved work is gone                                                   | The user's unsaved input is gone                           |
| Lifecycle       | Until `commit()` or `discard()`                                                 | Until the user saves or discards                           |

These two layers **cannot be merged into one**: merging would invert query semantics (unsaved buffers appear in query results), could not express modified / deleted, and could not cross transaction boundaries. So "the user clicked save but has not committed" lives in the working tree, and "the user has not clicked save yet" lives in the draft cache — neither is optional.

That is also why this package's public names carry **no `Workspace*` prefix** — that prefix already belongs to the draft cache, and a same-prefix-different-meaning is easier to be fooled by than an identical name.

### 3. `restore()` is "move old content into the working tree", not checkout

`restore()` reads a historical commit and writes its content back into the current working tree as **new uncommitted changes**. Afterwards:

- **Not one byte** of `HEAD` moved;
- **Not one entry** of history was deleted;
- The working tree is **dirty**, dirty on ordinary entries, same table and shape as hand-written changes;
- The next step is `commit()` (turn this restore into a new commit) or `discard()` (pretend it never happened).

**There is no detached HEAD and no `checkout()`**: `listCommits()` returns **data, not switchable positions**. To just look at another branch or a historical commit, use [read-only checkouts](#read-only-checkouts): they materialize the target's data into a read-only snapshot, and neither HEAD nor the working tree moves.

The restore target must be on the current branch HEAD's reachable parent chain; anything unreachable is `{ ok: false, reason: 'unreachable_target' }`, not an exception.

### 4. History keeps sensitive old values **as they are** — deleting is not erasing

Commit history is an immutable record. Once a field value was written into some commit, it stays in that commit's `ChangeSet` forever:

- Changing it later, clearing it, or even deleting the whole row does **not** touch the copy in history;
- `discard()` throws away the working tree, not history;
- `restore()` does not delete history either (see the previous item).

So: **do not write things that must leave no trace into a database with commit capability enabled** — passwords, plaintext tokens, one-time codes, personal data the user asked to "delete". Once committed, v1 has no public API to remove it from history (there is no entry point that writes history besides `commit()`, and no entry point that rewrites history — which is the other side of item 6 below).

In compliance scenarios, read this item as "this database is not suitable for storing fields that need right-to-erasure directly", not as "remember to clean up before committing".

### 5. Encryption boundary: the at-rest contract continues, but encryption is not access control

On backends that support field encryption, encrypted fields in commits, ChangeSets, working-tree entries, and restore sessions are still persisted as **versioned envelopes** — the persistence path **never** decrypts and then writes plaintext into the new system tables. Errors, summaries, and benchmark reports never contain encrypted-field plaintext either.

The boundary:

- Encryption protects **the bytes at rest**. After unlocking, reads return plaintext business values as usual — the working tree and history included;
- The "history keeps sensitive old values" risk does **not disappear because encryption is on** — encryption only guarantees that someone holding the database file cannot read it out; it does not guarantee that a legitimate user cannot read the old values;
- **At-rest encryption is not a substitute for item 4's warning, and item 4 is not a substitute for encryption.** Each handles one thing.

### 6. No history rewriting: no amend / rebase / squash / force push

For commits already written into history, v1 **provides no rewriting entry point**. No `amend`, no `rebase`, no `squash`, no "edit the commit message".

- Commits lost to CAS failures, and nodes left behind by deleted branches, still have their rows in the database — no ref points to them any more — "history ≠ the whole `rxdb_commit` table";
- When the commit graph is corrupted, the guard puts the branch into `corrupted_read_only` and leaves diagnostics, **without moving HEAD and without deleting records** (FR-022): auto-falling back to an earlier commit would keep the UI running, at the cost of swapping the user's data without their knowledge;
- v1 also provides **no auto-baseline** (auto-merging remote changes into HEAD after a sync) — that would fabricate an implicit history of "who committed what on the user's behalf, at what moment".

### Also: remote sync produces uncommitted changes with `origin = 'remote_sync'`

This one surprises people often, so it gets its own callout: **changes pulled by remote sync enter the working tree just like the user's own edits**, and do not enter history automatically.

- They count into `status().byOrigin` as `remote_sync` and are **not exempt**: `clean` becomes `false` and `entryCount` grows;
- The next `commit()` commits them along — `commit()` commits **all** uncommitted units in the working tree; there is no subset;
- The author is **this `commit()`'s `authorId`**, not the remote author. v1 deliberately does not forge the remote author's identity;
- So "the working tree suddenly became dirty after a sync" is **normal behavior**, not a defect. To tell who wrote what, read each `diff()` entry's `origin`.

If your UI has an "uncommitted changes" indicator, remember that background sync can light it up.

### Also: data outside version control

By default every business entity is version-controlled. There are only four exception classes; their changes never enter `status()` / `diff()` / `commit()`, and `restore()` never brings them back:

- `SyncType.QueryCache` entities: caches rebuildable from the remote;
- The `remoteId` and audit times (`createdAt` / `updatedAt`) on entity rows: sync and bookkeeping fields that do not express user intent;
- Derived index columns that plugins register on business tables;
- Entities with the change log off (`@Entity({ log: false })`), such as the storage plugin's file metadata: they write no change log, so branches, history, and undo could never see them anyway.

Entities with the change log off may be written in the same transaction as versioned entities; mixing QueryCache entities with the rest in one transaction is rejected (`mixed_versioned_cache_transaction`).

## Capability boundary: writes that bypass the adapter cannot be stopped

Write capture only covers **the write paths that go through the adapter and the adapter's public bulk write methods**. The following **cannot be stopped, and v1 does not promise to stop them**:

- Another process opening the same SQLite file directly and writing;
- Another PGlite instance pointed at the same data;
- Hand-written SQL in DevTools;
- Any external database handle that bypasses `@aiao/rxdb`.

Such writes do not enter the working tree, do not enter history, are not visible to `status()`, and will make the relationship between the working tree and the main data **silently drift**.

So a database with commit capability enabled has one hard constraint: **business tables may only be written through RxDB**.

That sentence is not a disclaimer footnote — **not pretending to stop something beats not stopping it**. A gate that claims to stop writes but does not makes people treat "no error" as "not bypassed", and the time it is actually bypassed also raises no error.

## Installation

```bash npm2yarn
npm install @aiao/rxdb-plugin-working-tree
# framework bindings (pick the one you need)
npm install @aiao/rxdb-plugin-working-tree-angular
npm install @aiao/rxdb-plugin-working-tree-react
npm install @aiao/rxdb-plugin-working-tree-vue
```

Peer dependencies: `@aiao/rxdb`, `rxjs`; the framework bindings additionally need the matching `@aiao/rxdb-angular` / `@aiao/rxdb-react` / `@aiao/rxdb-vue`.

:::info `switchBranch()` also needs the history plugin

The `db.versionManager` used by "Preconditions for switching branches" below is **not mounted by this package**, and it is not in core either — `@aiao/rxdb-plugin-history` mounts it inside the connection epoch (see [Branch management](../../collaboration/branch.md) and [History and sync extraction](../../migration/history-sync-plugins.md)).

Using only the working tree and commits (`status()` / `diff()` / `commit()` / `discard()` / `listCommits()` / `restore()`) does **not** need it;
to use the two preconditions of `switchBranch()`, install it and `use()` it together:

```bash npm2yarn
npm install @aiao/rxdb-plugin-history
```

Without it, `db.versionManager` is `undefined` — core provides no fallback.
:::

## Register the plugin

```typescript
import { RxDB } from '@aiao/rxdb';
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';

const db = new RxDB(config);
db.use(rxDBPluginWorkingTree); // ← must run before connect()
await db.connect('sqlite-wasm');

await db.workingTree.enable(); // a migration on an existing database, an idempotent confirmation on a new one
```

To use the two `switchBranch()` preconditions, `use()` the history plugin together — it mounts `db.versionManager`, and this package only adds preconditions on top:

```typescript
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';

db.use(rxDBPluginWorkingTree);
db.use(rxDBPluginHistory);
```

:::warning
**`use()` must come before `connect()`.** This plugin declares `system` (`RxDBSystemContribution`),
so the host must read its entities, initial rows, and migrations before creating tables; a `use()` after `connect()` has already missed table creation,
and core throws on the spot instead of silently skipping.
:::

`db.workingTree` is a **non-optional** member, augmented through `declare module '@aiao/rxdb'`: this entry only exists when the package is installed; without it, `db.workingTree` is a compile error rather than a runtime `undefined`. When the capability is not enabled it still exists, but every method rejects with `commit_capability_disabled`.

## Enable the capability

`enable()` is **idempotent**: on an existing database it flips the capability bit and adds a root node for every local branch (in one transaction); on a new database it is a confirmation. From then on, this process captures writes into the working tree starting with the next write; the enabling write itself belongs to HEAD, not to the working tree.

```typescript
await db.workingTree.enable();
console.log(await db.workingTree.isEnabled()); // true
```

Calling the other members while disabled throws `WorkingTreeCapabilityDisabledError` (`code: 'commit_capability_disabled'`) — this is "not enabled yet", and the way out is `enable()`; it is a different thing from "enabled but the version does not match" (`UnsupportedRxDBSystemVersionError`, the way out is upgrading the client or running a migration).

## Status and changes

### `status()`

Zero arguments — the summary asks "what does the current branch look like now", and the current branch is uniquely determined by the active branch.

```typescript
const status = await db.workingTree.status();
console.log(status.entryCount, status.clean, status.byOrigin);
```

Returns `WorkingTreeStatus`:

| Field                 | Type                         | Description                                                                    |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------ |
| `branchId`            | `string`                     | The current active branch id                                                   |
| `entryCount`          | `number`                     | Number of uncommitted entries                                                  |
| `clean`               | `boolean`                    | No uncommitted entries                                                         |
| `restoring`           | `boolean`                    | There is an unfinished restore session and the captured revision still matches |
| `conflicted`          | `boolean`                    | There is an unfinished restore session, but the captured revision has diverged |
| `byOrigin`            | `WorkingTreeOriginBreakdown` | Entries broken down by origin; `remote_sync` is **not exempt**                 |
| `activationRevision`  | `number`                     | One of the captured revisions: the branch activation revision                  |
| `headRevision`        | `number`                     | One of the captured revisions: the HEAD advance revision                       |
| `workingTreeRevision` | `number`                     | One of the captured revisions: the working tree revision                       |

All three revision fields are indispensable: they are exactly the three revisions that `commit()` / `discard()` require the caller to capture. Missing one, the caller can never construct a commit that cannot hit `CommitConflict`.

### `diff(options?)`

There is exactly one diff axis: `HEAD ↔ working tree`. There is no `from` / `to` / `ref` argument and no `branchId`.

```typescript
const diff = await db.workingTree.diff({
  granularity: 'transaction', // 'entity' | 'transaction', default 'entity'
  entities: ['Article'], // only look at these entities; an empty array = look at none
  limit: 50, // omit to get everything at once
  cursor: diff.nextCursor // continue paging
});
```

Returns `WorkingTreeDiff`: `branchId`, `baseHeadCommitId` (`null` when the branch has no commits yet), `workingTreeRevision`, `granularity`, `entries` (entity-granularity rows), `transactions` (transaction-granularity groups), `nextCursor` (`null` at the end). The two granularities are mutually exclusive: at entity granularity `transactions` is always an empty array, and vice versa.

`WorkingTreeDiffEntry`'s columns align one-to-one with `CommitChangeSet` — on commit, these units become the change set as-is: `unitId`, `transactionId` (`null` for a single `save()`), `namespace`, `entity`, `entityId`, `operation`, `patch`, `inversePatch`, `origin` (`'local' | 'remote_sync'`).

## Commit and discard

### `commit(message, options)`

Commit **all** uncommitted units in the current branch's working tree as one snapshot. Exactly two positional parameters: there is no selection argument and no optional third one. Writing the commit and clearing the working tree happen in one transaction.

```typescript
const status = await db.workingTree.status();

const result = await db.workingTree.commit('Save', {
  expectedBranch: {
    branchId: status.branchId,
    activationRevision: status.activationRevision
  },
  expectedHeadRevision: status.headRevision,
  expectedWorkingTreeRevision: status.workingTreeRevision,
  authorId: 'alice',
  operationId: crypto.randomUUID()
});

if (result.ok) {
  console.log('Committed', result.commitId, result.changeSetCount, 'units');
} else {
  // someone else committed first: conflict carries the new revisions; re-read status and retry
  console.warn(result.conflict);
}
```

| Input field (`CommitOptions`, all required) | Description                                                                                                                                                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expectedBranch`                            | The active branch **token** at capture time: `{ branchId, activationRevision }` — matching only `branchId` would let the token "match again" after a `main → feature → main` round trip, while the working tree has switched twice in between |
| `expectedHeadRevision`                      | The HEAD advance revision at capture time                                                                                                                                                                                                     |
| `expectedWorkingTreeRevision`               | The working tree revision at capture time                                                                                                                                                                                                     |
| `authorId`                                  | The commit author; lands in the immutable history's `Commit.author`                                                                                                                                                                           |
| `operationId`                               | The caller's operation id; retries of the same logical commit must carry the same value (idempotency key)                                                                                                                                     |

Returns `CommitResult` — the discriminator is `ok`:

- `ok: true`: `commitId` (the new commit id), `changeSetCount` (the number of change units), `headRevision` (the advanced HEAD revision)
- `ok: false`: `conflict` (`CommitConflict`); not one byte of this commit landed

### CAS and `CommitConflict`

The three captured revisions (branch identity, HEAD revision, working tree revision) are the commit's CAS credentials. If any of them mismatches, the commit fails and returns:

```typescript
interface CommitConflict {
  kind: 'working_tree_revision' | 'head_revision' | 'activation_revision';
  expected: number; // the value the caller captured
  actual: number; // the current value read in the transaction
  branchId: string; // the current active branch id
}
```

Failure goes through a **return value, not an exception** — a CAS conflict is the normal exit of concurrent editing, not an error. The way out for all three `kind`s is the same: re-run `status()`, let the user review, and commit again. `conflict` is never stored, and there is no "clear the conflict" API.

### `discard(options)`

Reset the current branch's whole working tree back to the current HEAD. Exactly one required positional parameter (the same `WorkingTreeCredentials`).

```typescript
const status = await db.workingTree.status();

const result = await db.workingTree.discard({
  expectedBranch: {
    branchId: status.branchId,
    activationRevision: status.activationRevision
  },
  expectedHeadRevision: status.headRevision,
  expectedWorkingTreeRevision: status.workingTreeRevision
});

if (result.ok) {
  // result.discardedCount: units discarded this time; 0 is a semantic no-op (the working tree was already clean)
} else {
  console.warn(result.conflict);
}
```

### `listCommits(options?)`

The commit history reachable from HEAD along the complete parent chain on the current branch. Like `status()` / `diff()`, it takes no `branchId`.

```typescript
const page = await db.workingTree.listCommits({
  limit: 20, // max entries from the HEAD end; omit for the whole reachable history
  since: new Date('2026-01-01'), // database time lower bound
  until: new Date('2026-09-01'), // database time upper bound
  entity: 'Article' // only commits that touched this entity
});
```

Returns `CommitLogPage`: `branchId` (always the active branch at read time), `headCommitId` (`null` when nothing has ever been committed), `entries` (newest first). A database with no commits yet is one page with an empty `entries` — that is a **meaningful emptiness**, not an error.

`CommitLogEntry` is a subset of the `Commit` entity's columns: `commitId`, `parentIds`, `firstParentId` (`null` for the root), `kind` (`'normal' | 'baseline' | 'branch_baseline'`; the latter two are system root nodes, not user commits), `message`, `authorId`, `createdAt`, `changeSetCount`. `operationId` and `contentFingerprint` are deliberately kept off the public surface — the entity is a storage detail, and history immutability does not rely on verbal promises.

> History ≠ the whole `rxdb_commit` table: commits lost to CAS failures and nodes left behind by deleted branches still have their rows, but no ref points to them.

### `commits$`

Emits one `WorkingTreeCommitEvent` (`{ commitId, branchId }`) synchronously whenever `commit()` **actually wrote a new commit**. The emission happens after the transaction committed but before `commit()`'s Promise resolves, so after `await commit()` subscribers have definitely received it, and `listCommits()` inside a callback definitely reads that `commitId`.

```typescript
db.workingTree.commits$.subscribe(({ commitId, branchId }) => console.log(branchId, commitId));
```

- **Does not emit**: `ok: false` (credential conflict / CAS failure), thrown errors, an idempotent replay with the same `operationId` (which also returns `ok: true`), `enable()`'s baseline, `restore()` / `discard()`. Judging only by the return value would count idempotent replays twice.
- The payload only has these two correlation keys; read the landed truth with `commitId` through `listCommits()` for message, author, etc.
- A subscriber that throws does not affect `commit()`'s return value or other subscribers.
- Not gated by the capability gate: you can subscribe on a database without commit capability enabled; it just never emits. The stream never `error`s and never `complete`s.

[`@aiao/rxdb-plugin-replay`](../rxdb-plugin-replay/README.md) relies on it to write commit markers on the recording timeline.

## Restore a historical version

### `restore(target, options)`

Write the content of a reachable historical commit back into the current working tree as **new uncommitted changes**. **Exactly two required positional parameters**, shaped like `commit()` — if `options` were optional, "read the revisions internally when omitted" would become a legal usage, and internally-read values always equal the current values, so the CAS would always hit.

```typescript
const status = await db.workingTree.status();

const result = await db.workingTree.restore(
  { commitId: 'commit-abc' }, // default entities = all units of the whole commit
  {
    expectedBranch: {
      branchId: status.branchId,
      activationRevision: status.activationRevision
    },
    expectedHeadRevision: status.headRevision,
    expectedWorkingTreeRevision: status.workingTreeRevision
  }
);
```

`target.entities` can name a subset of units (all three segments `{ namespace, entity, entityId }`). This does not conflict with "`commit()` cannot pick a subset" — the directions are exactly opposite: what is picked here is **what to write into the working tree**; after writing, they are part of the whole working tree like hand-written changes, and the next `commit()` commits everything as usual.

Returns `WorkingTreeRestoreResult`, the discriminator is `ok`:

| Exit                                       | Meaning                                                                                                                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ok: true`                                 | `restoredCount` (entries written into the working tree), `sessionId`, `workingTreeRevision`; `restoredCount: 0` is a no-op that wrote nothing                                          |
| `ok: false, reason: 'conflict'`            | One of the three captured revisions mismatched; carries `conflict`, same shape as `commit()`                                                                                           |
| `ok: false, reason: 'dirty_working_tree'`  | The working tree is not clean — `commit()` or `discard()` first                                                                                                                        |
| `ok: false, reason: 'incompatible_schema'` | An entity this client does not recognize is on the replay path; carries `incompatible` (first incompatible node, replay direction, entity and version manifest, **no patch contents**) |
| `ok: false, reason: 'unreachable_target'`  | The target commit is unreachable from the current HEAD                                                                                                                                 |

All four rejection causes go through a **return value**, not an exception: they are everyday paths a user hits by casually clicking the wrong history entry, not "the database is broken". On rejection, the persisted state is **byte-for-byte unchanged**.

The compatibility precheck runs **before any persistent write** and covers **every** node on the entire replay path — not just the target node: what actually gets read and applied is the inverse patch of every node between HEAD and the target, and if any node in between references an entity this client does not recognize, the materialized result is already wrong even if the target node itself is clean.

### `restoreSession()`

The current branch's unfinished restore session; `null` when there is none. Like `status()` / `listCommits()`, it takes **no `branchId`** — the session always belongs to the current active branch.

```typescript
const session = await db.workingTree.restoreSession();
// { id, branchId, targetCommitId, status } | null
```

The session is **a database row, not an in-memory field**: after cross-tab and refresh, "which commit this restore came from" must still be answerable.

"Does this restore still hold" is not answered by this entry point; that is `status()`'s two bits:

- `restoring: true` — there is an unfinished session and the captured revision still matches;
- `conflicted: true` — there is an unfinished session, but the captured revision has diverged.

A `conflicted` session is **not** an empty session: it still occupies the unique index and still blocks the next restore.

## Preconditions for switching branches

### `db.versionManager.switchBranch(branchId, options?)`

Switching branches lives on `db.versionManager`, not on `db.workingTree` — branches belong to `@aiao/rxdb-plugin-history`, and the working tree only **adds two optional preconditions** on top.

Therefore every line of this section assumes the history plugin is installed: without `use(rxDBPluginHistory)`, `db.versionManager` is `undefined`, and the error is reported on the line reading that slot — unrelated to the preconditions.

```typescript
// unconditional switch: byte-for-byte identical to not having this plugin installed
await db.versionManager.switchBranch('feature');

// the current branch must be clean, otherwise throws WorkingTreeDirtyError
await db.versionManager.switchBranch('feature', { requireClean: true });

// the activation generation must match, otherwise throws StaleActiveBranchError
await db.versionManager.switchBranch('feature', {
  expectedActivationRevision: status.activationRevision
});
```

| Field                        | Description                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `requireClean`               | Omitted / `false` = no opinion; `true` refuses the switch when the current branch is not empty |
| `expectedActivationRevision` | When provided, refuses the switch if the activation generation does not match the database's   |

Both fields are **optional**, and **not passing means not passing**: when no condition is given, this path issues not a single statement — it is not "read then ignore". `requireClean: false` and omitting it are the same thing.

**Rejection goes through an exception, not a return value** — exactly the opposite of `commit()` / `restore()`, because at that moment the branch **did not switch at all**, and there is no result to hand to the caller:

```typescript
import { WorkingTreeDirtyError } from '@aiao/rxdb-plugin-working-tree';

try {
  await db.versionManager.switchBranch('feature', { requireClean: true });
} catch (error) {
  if (error instanceof WorkingTreeDirtyError) {
    // error.branchId / error.entryCount: "2 uncommitted changes left on main; commit or discard first"
  }
}
```

v1 has **no automatic stash and does not carry a dirty working tree across branches**: the working tree belongs to a branch; after switching, what you see is **that** branch's working tree.

The other precondition is not controlled by `requireClean`: **the target branch's commit graph must be complete**. It is judged and thrown separately, and `requireClean: false` cannot turn it off — otherwise the history subsystem's replay path could switch into a history that cannot be replayed.

## Create a branch from a commit

### `createBranchFromCommit(branchId, commitId)` and `checkBranchFromCommit(commitId)`

Create a branch from a commit in the current branch's history (US-314 phase A), synonymous with git's `git branch <name> <commit>`: the new branch's HEAD is that commit, sharing the history before it with the original branch; the working tree is empty; switching to it reads the business tables exactly as they were when that `commit()` finished. The current branch does not move by one cell, and its uncommitted changes stay put.

**It only creates, it does not switch** — GitHub Desktop's "Create branch from commit" checks out the new branch after creating it; that step is the caller's next `switchBranch()`:

```typescript
const check = await db.workingTree.checkBranchFromCommit(commitId);
if (!check.ok) {
  // check.reason: 'unreachable_target' | 'fork_point_unknown' | 'history_rewritten'
}

const result = await db.workingTree.createBranchFromCommit('fix/login', commitId);
if (result.ok) {
  await db.versionManager.switchBranch(result.branch.id, { requireClean: true });
}
```

`checkBranchFromCommit()` writes nothing and lets the UI ask once before asking for a name; the database may have changed between the two calls, so `createBranchFromCommit()` re-judges. All three rejection causes go through the **return value**:

| `reason`             | Meaning                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `unreachable_target` | The commit is not on the current branch HEAD's reachable parent chain — same name and meaning as `restore()`                                                                   |
| `fork_point_unknown` | The commit has no recorded fork point: commits from before the fork point table existed, or the baseline written when a metadata-only branch first materialized                |
| `history_rewritten`  | There has been an undo or redo after the commit, changing the change log segment the new branch would inherit; switching to it would no longer read the data as of that commit |

When the capability is not enabled, the commit graph is corrupted, the branch id is unavailable, or a branch with that name already exists locally / remotely, it **throws** — same wording as `createBranch()`.

The fork point is recorded in the same transaction as the commit (`rxdb_commit_fork_point`): the new branch hangs on the branch the commit belongs to, forking at the change where it stopped; data is folded out of the change log along the lineage. Two points are consistent with how switching branches behaves today — keep them in mind:

- **Writes that do not enter the change log come along**: pulls after the commit, and expiry cleanup writing business tables with triggers off, are not undone by the switch, so the new branch carries them too.
- **Undoing changes before the fork point on the parent branch afterwards** changes the new branch's data along with it, just like any child branch.

## Read-only checkouts

Without switching branches or touching the working tree, open the **complete data** of another branch or a reachable commit on the current branch read-only, and browse it with ordinary queries and entity lists (US-313). `db.workingTree.checkouts` copies the business data into an independent snapshot database, layers the deltas needed to walk from the current branch to the target on top, then opens it read-only with a second RxDB instance.

| View        | Target         | What you see                                                                                                                                                           |
| ----------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch view | `{ branchId }` | That branch's data right now, including its uncommitted changes — row-for-row identical to "the data read after switching to it"                                       |
| Commit view | `{ commitId }` | The tracked data on the current branch exactly as of when that `commit()` finished; the commit must be on HEAD's reachable parent chain, same criterion as `restore()` |

A snapshot is the data **at build time**, not live; `view.refresh()` rebuilds one against the same target.

### Configure the snapshot database

The snapshot database uses the **same backend** as the main database, each with its own database name. The plugin option `worktrees.adapter` supplies the snapshot instance's adapter factory; the storage location follows the snapshot instance's own `db.config.dbName` (`wt-` plus a hash, one per checkout):

```typescript
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { rxDBPluginTree } from '@aiao/rxdb-plugin-tree';

db.use(rxDBPluginWorkingTree, {
  worktrees: {
    // main-thread IndexedDB: one independent IndexedDB database per checkout, deletable on close
    adapter: snapshot => new RxDBAdapterSqlite(snapshot, { vfs: 'idb' }),
    // the snapshot instance only loads plugins the read side needs: entities using TreeRepository need the tree plugin
    plugins: [rxDBPluginTree]
  }
});
```

:::warning
**Do not copy the main database's adapter factory verbatim.** If the main database runs in a Worker / SharedWorker and the Worker is named by an outer database name or a constant, a client inside the Worker that has initialized once gets reused directly, and the snapshot instance would silently connect to the main database. Connecting to the wrong database cannot corrupt the main one: the snapshot instance carries a marker migration registered only on snapshot databases, and opening a pre-existing database fails on the spot with `adapter_mismatch`.
:::

Do not put write-side plugins in `plugins` (history / sync / workspace / working-tree / storage / search).

### Open, browse, close

```typescript
const view = await db.workingTree.checkouts.open({ branchId: 'feature/x' }); // or { commitId }

const FeatureTodo = view.entityOf(Todo); // the main instance's entity class → the corresponding class on the snapshot instance
const todos = await firstValueFrom(
  view.rxdb.entityManager.getRepository(FeatureTodo).findAll({ where: { combinator: 'and', rules: [] } })
);

await view.close(); // disconnect the read-only instance, delete the snapshot database and its registration
```

| Member            | Description                                                                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `view.rxdb`       | The read-only second instance; hand it to each framework's Provider, and existing query hooks and rxdb-model entity lists work as usual                                           |
| `view.entityOf()` | The corresponding class of the main instance's entity class on the snapshot instance (same namespace, same name); throws `incomplete_entities` when the snapshot does not have it |
| `view.refresh()`  | Rebuild the snapshot against the same target, returning a new view; the old one closes with it                                                                                    |
| `view.close()`    | Disconnect, delete the snapshot database, revoke the registration                                                                                                                 |
| `view.release()`  | Only disconnect and release the lock; the registration and the snapshot database stay: persistent-owned ones for `attach()`, session-owned ones for `prune()`                     |

`checkouts.list()` reads the registry, `checkouts.attach(id)` re-opens a persistent-owned, fully built checkout (without rebuilding the snapshot), and `checkouts.prune()` reclaims ones nobody is using.

### Read-only, without polluting the main instance

- **Three layers of read-only**: core's `readOnly` makes the public write entry points throw `RxDBReadOnlyError`; read-only capture hooks block the adapter layer's bulk writes and raw writes; the engine seal (SQLite `PRAGMA query_only`, PGlite read-only transactions) catches writes that reach the adapter directly. Neither the snapshot database nor the main database changes.
- **Entity classes are clones**: one entity class cannot be registered on two instances; the snapshot instance uses classes produced by `cloneEntityClasses()`, so the main instance's entity cache, NEW events, and draft cache cannot touch them. The core system entities share the same class between the two instances — static calls like `RxDBBranch.find()` land on the writable main instance.
- **Encryption works as usual**: encrypted fields are copied envelope-for-envelope without decryption; building a snapshot never calls the keyring. The snapshot instance shares the keyring with the main instance (the envelope's AAD binds the database name), so calling `lock()` on the snapshot instance also locks the main database.

### What is in a snapshot

What gets copied are the main instance's business tables; system tables (the snapshot instance has its own set), QueryCache entities, and remote-only entities are not copied, and full-text search is not installed (the search plugin would need to write indexes into the snapshot database). Entities with the change log off (`log: false`) are copied as usual, but deltas do not touch them: inside the snapshot they are the **content as of the moment it was opened**, and do not follow the checked-out branch or commit. The storage file metadata is like this; the files themselves never enter the snapshot, and reading by path returns the current content at read time. The UI should label this "not versioned".

### Lifecycle and reclamation

- Each checkout holds one **exclusive** Web Lock: taken before writing the registry row, returned on close or release. When a tab closes or crashes, the browser returns the lock on its behalf: "nobody holds the lock" means "nobody is using it". One checkout can only be open in one place at a time; `attach()` without the lock gets `in_use`.
- `owner: 'session'` (the default) is session ownership — a tab gone means it should be reclaimed; `owner: 'persistent'` stays in the registry after release, and after a page refresh `attach(id)` opens it as it was.
- `prune()` reclaims session-owned checkouts whose lock is obtainable, plus unfinished ones (`building`). Before deleting, it connects to the snapshot database once with an empty entity set: the marker migration fails on the spot on a pre-existing database that is not a snapshot database, so a misconfigured factory pointing at the main database's storage errors instead of deleting the main database. Startup cleanup: when an existing database connects, the plugin reads the registry once in the bootstrap transaction that already exists, and only runs one `prune()` after connecting if there really are orphans (session-owned or unfinished, and nobody holds the lock). It does not reclaim unconditionally, because another connection's `connect()` first takes the system migration's exclusive lock and fails if it cannot get it — opening an extra transaction after connecting would make a tab that connects at the same moment fail to connect.
- `attach()` validates the entity structure fingerprint: if the application's entity structure changed, it reports `schema_mismatch`; open a new one.

### Supported backends

The first six backends: PGlite, sqlite-wasm, wa-sqlite, sqlite (official), sqliteai, Electron. The snapshot primitives (page reads, import, taking over the keyring, sealing) and database deletion (`dropStorage()`) are provided by the adapter. Backends that cannot delete their own storage under the current configuration answer `false` from `canDropStorage()`, and `open()` refuses with `unsupported_adapter` before building the snapshot: sqlite-wasm's `fs-handle`, wa-sqlite's `AccessHandlePoolVFS`, PGlite in-memory and data directories other than `idb://`, Electron PGlite. Adapters without snapshot primitives, such as Tauri, also report `unsupported_adapter`.

## Writable checkouts

Like GitHub Desktop 3.6's worktrees: read, write, and commit on another branch, while the main checkout's branch, working tree, and business tables do not move by one cell (US-314). A writable checkout is **a set of shadow tables in the same database**: `checkouts.add()` creates it, `mount()` makes the main instance mount it, and from then on reads, writes, capture, and commits all land on the branch it holds.

```typescript
const { checkouts } = db.workingTree;

const worktree = await checkouts.add('feature/x', { name: 'feature-x' }); // register, hold the branch, create tables, seed; created but not mounted
await checkouts.mount(worktree.id); // remount the main instance: entity cache cleared, live queries rerun, undo stack switched to that branch

const todo = new Todo();
todo.title = 'Write in the checkout';
await todo.save();
await db.workingTree.commit('Commit in the checkout', await credentials()); // commits into feature/x's history

await checkouts.mountMain(); // remount the main checkout
await checkouts.remove(worktree.id); // delete that table set, release the branch, delete the registration; uncommitted changes stay on the branch
```

| Method                             | Description                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add(branchId, { name?, owner? })` | In one transaction: register, hold the branch, create tables, seed (rows of the main table set copied as-is, then layered with the delta "the branch the main checkout sits on → this branch"); created but not mounted, and this context claims it. No name given → the branch id; taken → `-2`, `-3` appended |
| `mount(id)`                        | Mount the main instance on it; claim it first if not claimed. If an application upgrade changed the entity structure, or a plugin's attached objects on the tables changed, rebuild the whole set against the new structure in this one transaction (see below)                                                 |
| `mountMain()`                      | Remount the main checkout; claiming stays as is                                                                                                                                                                                                                                                                 |
| `release(id)`                      | Give up the claim: remount the main checkout first if mounted on it; tables, hold, and registration stay                                                                                                                                                                                                        |
| `remove(id)`                       | Remount the main checkout first if mounted on it, then delete the tables, release the branch, and delete the registration in one transaction                                                                                                                                                                    |
| `rename(id, name)`                 | Rename (leading/trailing whitespace stripped); an empty name reports `invalid_name`, a name taken by another writable checkout reports `name_taken`, and the main checkout and read-only checkouts cannot be renamed (`not_found`)                                                                              |
| `list()` / `prune()`               | List / reclaim both kinds — read-only and writable — distinguished by the registry row's `mode`; `prune()` also reclaims orphan table sets without a registry row and returns their table set suffix                                                                                                            |

### One branch can be held by only one checkout

Branches the main checkout is currently sitting on, or branches already held by another writable checkout, make `add()` throw `WorktreeBranchHeldError` (git: `already used by worktree`); the main checkout's `switchBranch()` onto a held branch is refused the same way. A held branch cannot be deleted either: `removeBranch()` throws `WorktreeBranchHeldError` (git: `Cannot delete branch … checked out at …`), and when a merge with `deleteSource` hits a held source branch, the merge completes as usual, the source branch stays, and `sourceDeleteError` carries this error. Delete that checkout and everything is released. Read-only checkouts do not hold branches.

### While mounted on a writable checkout

- The current branch is the branch it holds: `status()`, `commit()`, undo / redo, and the parent branch for branch creation all follow it.
- **No sync**: only the main checkout syncs; push-pull sync entry points throw as soon as they are entered, QueryCache auto-push waits until remounting the main checkout, and the pushable count is 0. Commits made on the checkout enter sync once that branch returns to the main checkout or is merged into the main line.
- **Merging**: `mergeBranch()` merges into the branch it holds, lands in that shadow table set and into its working tree, and the main checkout does not move by one cell. Only entities that exist in that table set (versioned entities with the change log on) are merged in; QueryCache-synced entities, which only exist in the main checkout's table set, are not merged — merging them would change the main checkout's tables. `previewMerge()` and `compareBranches()` use the same criterion.
- **QueryCache** has only the main checkout's copy: reads and writes while mounted on a checkout use it too, backfills still do not enter the change log, and the outbound queue still counts by the main checkout's branch.
- **Graph**: edge tables enter that shadow table set just like nodes; neighbor and path queries only look at that table set. When only one of a node and its edges is in the shadow set (for example the node is QueryCache-synced but the edges are not), graph queries refuse outright. Edge entities inherit `log: false` from their nodes.
- **Switching branches**: `switchBranch()` switches within the checkout: release the previously held branch, hold the target branch, change that table set over by deltas, and leave the changes on the original branch (GitHub Desktop's "Leave my changes"); the registry row's `branchId` follows. If the target is held by the main checkout or another checkout, it throws `WorktreeBranchHeldError`; a remote branch that is metadata-only locally reports `branch_not_materialized` (switch to it on the main checkout once first). Each table set has its own activation version: switching branches inside a checkout only advances its own, and the commit credentials the main checkout holds stay valid.
- **Multiple tabs**: each tab mounts its own table set — one can mount the main checkout while another mounts a writable checkout. Entity events carry which table set the write landed on (`tableSetSuffix`, absent for the main table set); after cross-tab forwarding, live queries and full-text search only merge into tabs mounted on the same table set. When one row has a copy in each of two table sets, changing it on one side does not touch the other side's live queries and entity caches.
- **The draft cache** (`@aiao/rxdb-plugin-workspace`) is partitioned by checkout: drafts created while mounted on a checkout are only visible on that checkout, and remounting lands them on disk first, then switches to the newly mounted table set's drafts (see the draft cache plugin's documentation). Entity objects obtained before a remount (including unsaved drafts) throw `WorktreeTableSetMismatchError` when saved onto another table set: saved as-is, an entity created on the main checkout would land in the checkout's shadow tables.
- **Full-text search** (`@aiao/rxdb-plugin-search`) has one index per table set: `add()` builds and backfills the checkout's table indexes in the same transaction that creates the tables; searches hit the mounted table set, and existing search handles requery automatically after a remount. If the search plugin was not installed when the checkout was created, the first search after mounting builds them. Deleting a checkout deletes its indexes with it.

When a plugin needs its own attached objects (such as indexes) per shadow table set, declare `worktreeTableSet` (core's `WorktreeTableSetHooks`): `created(executor, tableSet)` runs in `use()` order, inside the same transaction, after `add()` creates and seeds the tables — a throw rolls back the whole transaction; `fingerprint(tableSet)` returns the shape of the attached objects and joins the checkout's fingerprint — when it changes, mounting the checkout rebuilds the whole set and reruns `created`.

### Lifecycle and reclamation

- **Persistent ownership by default** (consistent with git and GitHub Desktop): it survives restarts, the branch stays held until `remove()`, and any context can claim it again with `mount(id)`. `owner: 'session'` ones are reclaimed by `prune()` after the claiming tab ends.
- Claiming uses the checkout's Web Lock: `add()` / `mount()` take it, `release()` / `remove()` return it; while another context holds the claim, `mount()` / `remove()` report `in_use`.
- `prune()` and startup cleanup also reclaim writable checkouts whose **held branch no longer exists**. A writable checkout's tables live in the main database, so no snapshot database is needed to reclaim them.
- **Orphan table sets**: the registry row is gone, but the table set, the hold key on the branch, or its activation state row is still there (a registry row deleted externally, leftovers from an old version) — so the branch can never be deleted. `prune()` deletes the tables, releases the branch, and deletes the activation state row in one transaction per set, and returns its table set suffix (`wt_…`); startup cleanup finds them in the connection epoch's bootstrap transaction and reclaims them after connecting if there are any. Only suffixes that checkouts produce are recognized; hand-built table sets and tables whose names merely look like that are left alone.
- **Structure changes auto-rebuild**: when a checkout is created, the registry row records the table set's fingerprint (the member entities' structure, merged with the plugins' table-set hook fingerprints). Later `mount()` finds a mismatch, and in that mounting transaction: deletes the tables, re-seeds by the "the branch the main checkout sits on → held branch" delta, reruns the plugins' table-set hooks, and records the new fingerprint; the held branch does not change, uncommitted changes come back with the seeding, and what you read matches a switch row-for-row. Any step failing rolls back the whole transaction and throws `WorktreeUnavailableError` (`schema_rebuild_failed`, `cause` is the original error), leaving the checkout as it was.
- Uncommitted changes are not lost when a checkout closes: writes inside the checkout are recorded in that branch's change log, so switching to it reads them back (git loses them when deleting a worktree; this does not).

### Known limitations

- The auto-rebuild cannot layer deltas onto a new structure: a renamed column, or a new required column without a default, fails the whole rebuild (`schema_rebuild_failed`); the checkout stays as it was and cannot be mounted. Newly encrypted columns are plaintext in old changes and are copied as-is by the rebuild; writes on the main checkout that do not log (pull backfills and the like) blend into the rebuilt copy.
- With integer auto-increment primary keys, the two table sets increment independently and may produce identical ids across sets (the sequence is aligned at seeding).
- A remote branch must first be switched to once on the main checkout, materializing its data locally, before you can create a checkout for it or switch to it inside a checkout.
- Checkouts are a local concept with no downgrade guarantee: databases with hold keys have migrated to system schema 8, and older clients are refused at connection (`UnsupportedRxDBSystemVersionError`).

PGlite and the SQLite family (wa-sqlite, sqlite-wasm, sqlite, sqliteai, Electron) are all supported, with one shared conformance suite. When an adapter has no table-set create/drop slots (`createWorktreeTableSet` / `dropWorktreeTableSet`), `add()` reports `unsupported_adapter`.

## The unclaimed capability guard

A database that has been `enable()`d leaves a capability watermark row in `rxdb_migration` (`__rxdb_capability__:workingTree:1:@aiao/rxdb-plugin-working-tree`). **When a client without this package opens the database again, core refuses the connection** and reports the package name to install, verbatim:

```
This database enables an RxDB capability the current process has not claimed; without the matching plugin, writes would not be governed by that capability, so the connection is refused:
  - workingTree v1 —— install @aiao/rxdb-plugin-working-tree
```

This guard is the core benefit of extracting this package from core: it replaces the old practice of locking out old clients by raising `RXDB_SYSTEM_SCHEMA_VERSION`, and it **works for third-party plugins too** — the package name is written into the watermark row by the plugin itself, and core does not need to know it.

## System tables

Twelve, in creation order:

`CommitCapabilityState`, `WorkingTreeActivationState`, `Commit`, `CommitChangeSet`, `CommitBranchRef`,
`WorkingTreeState`, `WorkingTreeEntry`, `WorkingTreeRestoreSession`, `WorkingTreeMaterializationStage`,
`WorkingTreeMaterializationPage`, `Worktree` (the read-only checkout registry, `rxdb_worktree`), `CommitForkPoint`
(the commit's fork point, `rxdb_commit_fork_point`). None of them writes a change log.

They enter core's system entity identity set through `registerSystemEntities()`, so `isSystemEntity()` recognizes them — cross-package consumers like `@aiao/rxdb-adapter-http` will not push them to the remote as integration-side data.

## Framework bindings

The three frameworks' `useWorkingTree()` have the **same name, same fields, same method signatures**; only the state container shape differs (`Signal` / render snapshot / `ComputedRef`). Add or remove a member on any one end and all three frameworks' specs go red.

### Angular

```typescript
import { Component } from '@angular/core';
import { useWorkingTree } from '@aiao/rxdb-plugin-working-tree-angular';

@Component({
  selector: 'app-commit-bar',
  template: `
    @switch (tree.statusState().phase) {
      @case ('loading') {
        <span>Reading…</span>
      }
      @case ('empty') {
        <span>No uncommitted changes</span>
      }
      @case ('success') {
        <span>{{ tree.statusState().value.entryCount }} uncommitted</span>
      }
    }
    <button [disabled]="tree.commitState().phase === 'loading'" (click)="save()">Commit</button>
  `
})
export class CommitBar {
  readonly tree = useWorkingTree();

  async save(): Promise<void> {
    const status = await this.tree.status();
    const result = await this.tree.commit('Save', {
      expectedBranch: {
        branchId: status.branchId,
        activationRevision: status.activationRevision
      },
      expectedHeadRevision: status.headRevision,
      expectedWorkingTreeRevision: status.workingTreeRevision,
      authorId: 'alice',
      operationId: crypto.randomUUID()
    });
    if (!result.ok) console.warn('Someone else committed first; just retry', result.conflict);
  }
}
```

`useWorkingTree()` **must be called inside an Angular injection context** — it gets the database through `useRxDB()`, so `provideRxDB()` must exist upstream. Each of the ten state cells is packed into its own `Signal`: when the template only reads `statusState`, a phase change from one `diff()` does not make it re-evaluate.

### React

```tsx
import { useWorkingTree } from '@aiao/rxdb-plugin-working-tree-react';

export function CommitBar() {
  const tree = useWorkingTree();

  const save = async () => {
    const status = await tree.status();
    const result = await tree.commit('Save', {
      expectedBranch: {
        branchId: status.branchId,
        activationRevision: status.activationRevision
      },
      expectedHeadRevision: status.headRevision,
      expectedWorkingTreeRevision: status.workingTreeRevision,
      authorId: 'alice',
      operationId: crypto.randomUUID()
    });
    if (!result.ok) console.warn('Someone else committed first; just retry', result.conflict);
  };

  return (
    <div>
      {tree.statusState.phase === 'empty' && <span>No uncommitted changes</span>}
      {tree.statusState.phase === 'success' && <span>{tree.statusState.value.entryCount} uncommitted</span>}
      <button disabled={tree.commitState.phase === 'loading'} onClick={() => void save()}>
        Commit
      </button>
    </div>
  );
}
```

`useWorkingTree()` gets the database through `useRxDB()`, so the component tree must have an `RxDBProvider`. The ten state fields are **plain read-only values** (`Readonly<WorkingTreeAsyncStates>`) and can be destructured directly; the ten methods have **stable references** and are safe to put into `useEffect` / `useMemo` dependency arrays.

### Vue

```vue
<script lang="ts" setup>
import { useWorkingTree } from '@aiao/rxdb-plugin-working-tree-vue';

const tree = useWorkingTree();

const save = async (): Promise<void> => {
  const status = await tree.status();
  const result = await tree.commit('Save', {
    expectedBranch: {
      branchId: status.branchId,
      activationRevision: status.activationRevision
    },
    expectedHeadRevision: status.headRevision,
    expectedWorkingTreeRevision: status.workingTreeRevision,
    authorId: 'alice',
    operationId: crypto.randomUUID()
  });
  if (!result.ok) console.warn('Someone else committed first; just retry', result.conflict);
};
</script>

<template>
  <span v-if="tree.statusState.value.phase === 'empty'">No uncommitted changes</span>
  <span v-else-if="tree.statusState.value.phase === 'success'">
    {{ tree.statusState.value.value.entryCount }} uncommitted
  </span>
  <button :disabled="tree.commitState.value.phase === 'loading'" @click="save">Commit</button>
</template>
```

`useWorkingTree()` gets the database through `useRxDB()`, so `provideRxDB()` must exist upstream. Each of the ten state cells is packed into its own `ComputedRef`: when the template only reads `statusState`, a phase change from one `diff()` does not make it re-evaluate.

### The fourteen async state cells

All three frameworks share one state contract (`WorkingTreeAsyncStates`, defined in the plugin package rather than the three framework packages):

| Field                         | Type                                                | Description                                                                                                                   |
| ----------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `isEnabledState`              | command `<boolean>`                                 | State of `isEnabled()`                                                                                                        |
| `enableState`                 | command `<CommitCapabilityInfo>`                    | State of `enable()`                                                                                                           |
| `enableIfEmptyState`          | command `<WorkingTreeEnableIfEmptyResult>`          | State of `enableIfEmpty()`; **no empty** — `not_empty` is a result                                                            |
| `statusState`                 | query `<WorkingTreeStatus>`                         | State of `status()`; **empty means no uncommitted changes**                                                                   |
| `diffState`                   | query `<WorkingTreeDiff>`                           | State of `diff()`; **empty means no displayable changes**                                                                     |
| `listCommitsState`            | query `<CommitLogPage>`                             | State of `listCommits()`; **empty means no history yet**                                                                      |
| `commitChangesState`          | query `<CommitChangeSetPage>`                       | State of `commitChanges()`; **empty means this commit has no change units** (a baseline node)                                 |
| `commitState`                 | command `<CommitResult>`                            | State of `commit()`; **no empty**                                                                                             |
| `discardState`                | command `<WorkingTreeDiscardResult>`                | State of `discard()`; **no empty**                                                                                            |
| `restoreState`                | command `<WorkingTreeRestoreResult>`                | State of `restore()`; **no empty** — the four rejection causes and `restoredCount: 0` are all results                         |
| `restoreSessionState`         | query `<WorkingTreeRestoreSessionInfo \| null>`     | State of `restoreSession()`; **empty means the current branch has no unfinished restore session**, and it carries that `null` |
| `switchBranchState`           | command `<void>`                                    | State of `switchBranch()`; **no empty** — switching to the current branch is a successful no-op                               |
| `checkBranchFromCommitState`  | command `<WorkingTreeBranchFromCommitCheck>`        | State of `checkBranchFromCommit()`; **no empty** — "can be created" and the three rejection causes are all results            |
| `createBranchFromCommitState` | command `<WorkingTreeCreateBranchFromCommitResult>` | State of `createBranchFromCommit()`; **no empty** — "created" and the three rejection causes are all results                  |

Query states have five phases: `idle → loading → success / empty / error`; command states have four (no `empty`). Two discrimination details:

- **`switchBranch()` rejections go through `error`**: `requireClean` hitting a dirty working tree, and a stale activation generation, are exceptions rather than return values — at that moment the branch did not switch at all, and there is no result to hand to the caller.
- **`commit()`'s CAS conflict goes through `success`** (a conflict with `CommitResult.ok === false` is also a successful exit), **not `error`** — a conflict is the normal exit of concurrent editing, not an error.
- **`empty` is a refinement of `success`, and `value` is still there**: in an empty `status()` the three revisions are still readable — no need to query again just to get them.

The error state keeps the `error` (the `Error` instance passed through untouched — `instanceof` and `code` are both there); retrying means calling the corresponding method again.

### Behavior contract (identical across all three)

- **The creation entry point itself issues not a single IO**: all fourteen state cells start as `idle`; the database is only read when a method is actually called.
- **There is no change stream**: state only updates after commands issued through this entry point. Changes written in by other tabs, and writes that go directly through `entity.save()`, do not push a fresh status — call `status()` again for the latest value.
- When the database is unavailable, it **throws**, instead of returning a default "everything is clean".
- Rejections of `commit()` / `discard()` / `restore()` / `checkBranchFromCommit()` / `createBranchFromCommit()` go through return values (`result.ok === false`), not exceptions; `switchBranch()` rejections go through **exceptions**.
- `createBranchFromCommit()` does not switch and does not re-read `status()`: the current branch's working tree has not moved by one cell, and the `switchBranch()` that switches over re-reads.
- After `enable()` / `discard()` / `restore()` / `switchBranch()` succeed, `status()` is re-read once automatically — the summary `switchBranch()` re-reads belongs to **another** branch.
- `switchBranch()` lives on the history plugin (`@aiao/rxdb-plugin-history`)'s `versionManager`, not on `workingTree`, so the three framework entry points take the whole `RxDB`, not just `db.workingTree`.
- Types and error classes are always imported directly from `@aiao/rxdb-plugin-working-tree`; the binding packages **do not redefine and do not re-export** them.

### Checkouts: `useWorktrees()`

The three frameworks' `useWorktrees()` share the same name and API; commands have the same signatures as the same-named methods on `db.workingTree.checkouts`, one command per state cell, and within one cell the later request wins:

| Command                                 | State cell                                          | Re-reads the registry after settling                                |
| --------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------- |
| `list()`                                | `listState` (`empty` when there is no registry row) | —                                                                   |
| `open(target, options?)` / `attach(id)` | `openState` / `attachState`                         | Yes; also after the view's `close()` / `release()` / `refresh()`    |
| `prune()`                               | `pruneState`                                        | Yes                                                                 |
| `add(branchId, { name?, owner? })`      | `addState` (the created registry row)               | Yes                                                                 |
| `mount(id)`                             | `mountState`                                        | Yes (writes the mount access time; also the fingerprint on rebuild) |
| `mountMain()` / `release(id)`           | `mountMainState` / `releaseState`                   | No (does not write the registry)                                    |
| `remove(id)`                            | `removeState`                                       | Yes                                                                 |
| `rename(id, name)`                      | `renameState` (the renamed registry row)            | Yes                                                                 |

There is also `mounted`: the table set this instance is currently mounted on (`db.worktreeTableSet$`, which only changes after a remount settles and the entity cache is cleared; after a rebuild it is a new instance with the same suffix) — a render snapshot in React, a `Signal` in Angular, a `ComputedRef` in Vue.

- `mounted.isMain` means mounted on the main checkout; among writable checkouts' registry rows, the one with `tableSetSuffix === mounted.suffix` is the mounted one (registry rows come in read-only and writable kinds, distinguished by `mode`).
- The current branch is the one with `activeKey === mounted.holderKey`. Do not use `activated` any more: it only says which branch the main checkout sits on, and while mounted on a writable checkout, the held branch's `activated` is false.
- After a remount, `useWorkingTree()`'s fourteen cells **do not re-read on their own** (it has no change stream, see above). Components that must follow the switch subscribe to `mounted` and re-read: React `useEffect(() => …, [worktrees.mounted])`, Angular `effect()` reading `worktrees.mounted()`, Vue `watch(worktrees.mounted, …)`, skipping the first initial value.
- `mounted` takes its initial value from the stream, and throws if the stream has not delivered the current table set when subscribed; Angular unsubscribes at injector destruction, Vue at scope destruction, React at unmount. Vue's `useWorktrees()` must be called in `setup()` or an `effectScope`.

The view obtained from opening a read-only checkout hands `view.rxdb` to each framework's existing Provider, and the query hooks and rxdb-model entity lists inside work as usual (on a read-only instance, lists render no write controls):

- React: `<RxDBProvider db={view.rxdb}>…</RxDBProvider>`
- Vue: `provideRxDB(view.rxdb)` in a child component; keep the view in a `shallowRef` — an RxDB instance's private fields cannot survive a deep reactive proxy
- Angular: `{ provide: RxDB, useValue: view.rxdb }` in a child component's injector, for example through `NgComponentOutlet`'s `injector`

`useWorktrees()` itself must be called **outside** the nested Provider: the snapshot instance has no working-tree plugin installed. Writable checkouts mount on the main instance, so there is no such nesting.

## Error types

| Error                                | When                                                                                                                                                                                                | Way out                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `WorkingTreeCapabilityDisabledError` | A managed member is called before the database enabled commit capability (`code: 'commit_capability_disabled'`)                                                                                     | `db.workingTree.enable()` first                                                  |
| `UnsupportedRxDBSystemVersionError`  | The database enabled the capability, but the capability version triple does not match this process                                                                                                  | Upgrade the client or run a migration                                            |
| `CommitValidationError`              | The commit message is empty, or the working tree is clean (`empty_commit`)                                                                                                                          | Check the arguments and `status()`                                               |
| `CommitGraphCorruptedError`          | The current branch's commit graph is corrupted (FR-051)                                                                                                                                             | Diagnostics on the scene                                                         |
| `WorkingTreeEntryCountMismatchError` | The redundant column disagrees with the actual entry row count — two truths in the database disagree                                                                                                | Diagnostics on the scene                                                         |
| `WorkingTreeDirtyError`              | `switchBranch(..., { requireClean: true })` hit a non-empty working tree (`code: 'working_tree_dirty'`, carries `branchId` / `entryCount`)                                                          | `commit()` or `discard()` first, or do not pass `requireClean`                   |
| `StaleActiveBranchError`             | `expectedActivationRevision` does not match the database's activation generation (`code: 'stale_active_branch'`, carries both tokens `expected` / `actual`)                                         | Re-read `status()` and switch again                                              |
| `WorktreeUnavailableError`           | A checkout cannot be opened (`reason`: no snapshot database configured, backend unsupported, branch missing, commit unreachable, a restore in progress, `in_use`, and seven more — thirteen in all) | Handle by `reason`; commit view rejections use the same criterion as `restore()` |
| `WorktreeBranchHeldError` (core)     | Creating a writable checkout or switching branches on the main checkout while another checkout holds the branch (`code: 'worktree_branch_held'`, carries `branchId` / `holderKey`)                  | Pick another branch, or delete the holding checkout first                        |
| `RxDBReadOnlyError` (core)           | Writing on a read-only checkout's instance                                                                                                                                                          | Write on the main instance                                                       |

## Conformance suite

`@aiao/rxdb-plugin-working-tree/testing` exports a cross-backend conformance suite (capture + commit + worktree), and the six adapter packages (electron / sqlite / sqlite-wasm / pglite / sqliteai / wa-sqlite) each pull three suites. When adding an adapter, wire up these three to earn the cross-backend guarantee "capture misses nothing, commits are correct, and read-only checkouts match what switching reads".

The read-only checkout suite's context has one more optional item than the other two: `createDatabaseWithPersistentSnapshots` — only the "a persistent-owned checkout reopens as-is after release" case requires the snapshot database on persistent storage. For backends where a snapshot database on persistent storage is expensive (for example, OPFS can only open in a dedicated Worker, one Worker per snapshot database), give `createDatabase` an in-memory-tier snapshot and this item a persistent-tier one; without it, `createDatabase` is used, in which case its snapshot database must land on persistent storage.

## Related documents

- [Data collaboration](../../collaboration/README.md) — the workflow view of branches, sync, and undo/redo
- [Versioning and API stability policy](../../versioning.md)
- API reference: `api/rxdb-plugin-working-tree` (this package), `api/rxdb-plugin-working-tree-angular` / `-react` / `-vue` (the binding packages)
