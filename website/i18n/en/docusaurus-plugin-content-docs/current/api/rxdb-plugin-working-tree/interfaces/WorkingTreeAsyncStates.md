# WorkingTreeAsyncStates

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L139)

All state held by the three-framework entry points, one field per capability.

## Remarks

The key set is the six items closed by US-306 phase C, plus `restore()` / `restoreSession()` added by T110,
plus `switchBranch()` added by T123, plus `commitChanges()` on the commit-detail side,
and `enableIfEmpty()` from auto-enable — all twelve items of the tri-framework-api.md §3 list; US-314 phase A added
`checkBranchFromCommit()` / `createBranchFromCommit()` for creating branches from commits, fourteen in total.

`switchBranchState` uses the **command** state rather than the query one: switching branches has no "empty" shape, success means it switched
(`VersionManager.switchBranch()` returns `void`), and being rejected by `requireClean` is a
`WorkingTreeDirtyError`, which lands in the `error` phase. Switching to the current branch is a no-op **success**,
the same shape as `discard()`'s `discardedCount: 0`, not "there is nothing here".

A single record rather than fourteen independent containers: the reactive primitives of all three frameworks work on "one write triggers one notification",
fourteen containers would be fourteen notification paths, and one `commit()` changes both `commitState` and `statusState`
(the summary refreshes after the command succeeds) — when the two paths arrive at different times, the UI would see the frame
of "the commit succeeded but the summary is still the old one".

## Properties

### checkBranchFromCommitState \{#checkbranchfromcommitstate\}

```ts
readonly checkBranchFromCommitState: WorkingTreeCommandState<WorkingTreeBranchFromCommitCheck>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L177)

The state of `checkBranchFromCommit()`; **no empty** — creatable and the three rejection causes are all results

---

### commitChangesState \{#commitchangesstate\}

```ts
readonly commitChangesState: WorkingTreeQueryState<CommitChangeSetPage>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:159](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L159)

The state of `commitChanges()`; empty means "this commit has no change units" (a baseline node)

---

### commitState \{#commitstate\}

```ts
readonly commitState: WorkingTreeCommandState<CommitResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:162](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L162)

The state of `commit()`; **no empty**

---

### createBranchFromCommitState \{#createbranchfromcommitstate\}

```ts
readonly createBranchFromCommitState: WorkingTreeCommandState<WorkingTreeCreateBranchFromCommitResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:180](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L180)

The state of `createBranchFromCommit()`; **no empty** — created and the three rejection causes are all results

---

### diffState \{#diffstate\}

```ts
readonly diffState: WorkingTreeQueryState<WorkingTreeDiff>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:153](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L153)

The state of `diff()`; empty means "no changes to display"

---

### discardState \{#discardstate\}

```ts
readonly discardState: WorkingTreeCommandState<WorkingTreeDiscardResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:165](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L165)

The state of `discard()`; **no empty**

---

### enableIfEmptyState \{#enableifemptystate\}

```ts
readonly enableIfEmptyState: WorkingTreeCommandState<WorkingTreeEnableIfEmptyResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:147](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L147)

The state of `enableIfEmpty()`; **no empty** — `not_empty` is a result, not "there is no content"

---

### enableState \{#enablestate\}

```ts
readonly enableState: WorkingTreeCommandState<CommitCapabilityInfo>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:144](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L144)

The state of `enable()`

---

### isEnabledState \{#isenabledstate\}

```ts
readonly isEnabledState: WorkingTreeCommandState<boolean>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L141)

The state of `isEnabled()`

---

### listCommitsState \{#listcommitsstate\}

```ts
readonly listCommitsState: WorkingTreeQueryState<CommitLogPage>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L156)

The state of `listCommits()`; empty means "this branch has no history yet"

---

### restoreSessionState \{#restoresessionstate\}

```ts
readonly restoreSessionState: WorkingTreeQueryState<
  | WorkingTreeRestoreSessionInfo
  | null>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L171)

The state of `restoreSession()`; empty means "the current branch has no unfinished restore session"

---

### restoreState \{#restorestate\}

```ts
readonly restoreState: WorkingTreeCommandState<WorkingTreeRestoreResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:168](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L168)

The state of `restore()`; **no empty** — the four rejection causes and `restoredCount: 0` are all results

---

### statusState \{#statusstate\}

```ts
readonly statusState: WorkingTreeQueryState<WorkingTreeStatus>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:150](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L150)

The state of `status()`; empty means "no uncommitted changes"

---

### switchBranchState \{#switchbranchstate\}

```ts
readonly switchBranchState: WorkingTreeCommandState<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L174)

The state of `switchBranch()`; **no empty** — a switch has only two outcomes: "switched" and "rejected / errored"
