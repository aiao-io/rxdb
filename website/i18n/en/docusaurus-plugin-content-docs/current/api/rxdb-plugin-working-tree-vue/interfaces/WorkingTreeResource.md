# WorkingTreeResource

Defined in: [use-working-tree.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L56)

Return value of [useWorkingTree](../functions/useWorkingTree.md).

## Remarks

The fourteen state fields correspond one-to-one with the core `WorkingTreeAsyncStates`, each wrapped in its own `ComputedRef`: members can be destructured safely, and when a template only reads `statusState`, a phase change from one `diff()` call does not make it re-evaluate. The fourteen method signatures are exactly the same as the same-named methods on the plugin package's `WorkingTreeManager` (the `switchBranch` one is on `VersionManager`) — parameters and return values use the types from `@aiao/rxdb-plugin-working-tree`; this package **does not redefine them** (tri-framework-api.md §1).

Equivalent implementations across the three frameworks: Angular `useWorkingTree()` (`Signal`), React `useWorkingTree()` (render snapshot); field names, method names and semantics are exactly the same, only the container form differs. The entry point binds the database injected at `setup()` time: when the source of `provideRxDB()` changes databases, this still points at the old database — to follow the switch, add `:key` to the components that use it so they rebuild with the database (the React version resets itself when the Provider switches databases).

The four rejection reasons of `restore()` come back via the **return value** rather than exceptions, so `restoreState` also has **no empty**: "rejected" and "nothing restored" are both results, not "no result". The emptiness of `restoreSessionState` has exactly one meaning — the current branch has no unfinished restore session; a `conflicted` session is still **not** empty, it still holds the unique index and still blocks the next restore.

`WorkingTreeSwitchBranchOptions` of `switchBranch(branchId, options?)` is wired in by T123: without the second argument it is byte-for-byte identical to today (unconditional switch), and `{ requireClean: true }` **throws** `WorkingTreeDirtyError` when the working tree is not clean — rejection is not a return value, because at that moment the branch was never switched.

## Properties

### checkBranchFromCommit \{#checkbranchfromcommit\}

```ts
readonly checkBranchFromCommit: (commitId) => Promise<WorkingTreeBranchFromCommitCheck>;
```

Defined in: [use-working-tree.ts:114](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L114)

Checks whether a reachable commit can be used to create a branch; the three rejection reasons come back via the return value, not exceptions.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `commitId` | `string` |

#### Returns

`Promise`&lt;[`WorkingTreeBranchFromCommitCheck`](../../rxdb-plugin-working-tree/type-aliases/WorkingTreeBranchFromCommitCheck.md)&gt;

***

### checkBranchFromCommitState \{#checkbranchfromcommitstate\}

```ts
readonly checkBranchFromCommitState: ComputedRef<WorkingTreeCommandState<WorkingTreeBranchFromCommitCheck>>;
```

Defined in: [use-working-tree.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L82)

Phase of the last `checkBranchFromCommit()`; **no empty** — being able to create and the three rejection reasons are all results.

***

### commit \{#commit\}

```ts
readonly commit: (message, options) => Promise<CommitResult>;
```

Defined in: [use-working-tree.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L101)

Commits **all** uncommitted units in the working tree; CAS failure comes back via the return value, not an exception.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `options` | [`CommitOptions`](../../rxdb-plugin-working-tree/interfaces/CommitOptions.md) |

#### Returns

`Promise`&lt;[`CommitResult`](../../rxdb-plugin-working-tree/type-aliases/CommitResult.md)&gt;

***

### commitChanges \{#commitchanges\}

```ts
readonly commitChanges: (commitId) => Promise<CommitChangeSetPage>;
```

Defined in: [use-working-tree.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L99)

Reads all change units of one commit.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `commitId` | `string` |

#### Returns

`Promise`&lt;[`CommitChangeSetPage`](../../rxdb-plugin-working-tree/interfaces/CommitChangeSetPage.md)&gt;

***

### commitChangesState \{#commitchangesstate\}

```ts
readonly commitChangesState: ComputedRef<WorkingTreeQueryState<CommitChangeSetPage>>;
```

Defined in: [use-working-tree.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L70)

Phase of a single commit's change set; zero change units (a baseline node) is `empty`.

***

### commitState \{#commitstate\}

```ts
readonly commitState: ComputedRef<WorkingTreeCommandState<CommitResult>>;
```

Defined in: [use-working-tree.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L72)

Phase of the last `commit()`; **no empty** — zero uncommitted changes is an `empty_commit` error.

***

### createBranchFromCommit \{#createbranchfromcommit\}

```ts
readonly createBranchFromCommit: (branchId, commitId) => Promise<WorkingTreeCreateBranchFromCommitResult>;
```

Defined in: [use-working-tree.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L116)

Creates a branch from a reachable commit, without switching or re-reading status; the three rejection reasons come back via the return value, not exceptions.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `branchId` | `string` |
| `commitId` | `string` |

#### Returns

`Promise`&lt;[`WorkingTreeCreateBranchFromCommitResult`](../../rxdb-plugin-working-tree/type-aliases/WorkingTreeCreateBranchFromCommitResult.md)&gt;

***

### createBranchFromCommitState \{#createbranchfromcommitstate\}

```ts
readonly createBranchFromCommitState: ComputedRef<WorkingTreeCommandState<WorkingTreeCreateBranchFromCommitResult>>;
```

Defined in: [use-working-tree.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L84)

Phase of the last `createBranchFromCommit()`; **no empty** — a successful creation and the three rejection reasons are all results.

***

### diff \{#diff\}

```ts
readonly diff: (options?) => Promise<WorkingTreeDiff>;
```

Defined in: [use-working-tree.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L95)

Reads the current branch's uncommitted changes relative to HEAD.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`WorkingTreeDiffOptions`](../../rxdb-plugin-working-tree/interfaces/WorkingTreeDiffOptions.md) |

#### Returns

`Promise`&lt;[`WorkingTreeDiff`](../../rxdb-plugin-working-tree/interfaces/WorkingTreeDiff.md)&gt;

***

### diffState \{#diffstate\}

```ts
readonly diffState: ComputedRef<WorkingTreeQueryState<WorkingTreeDiff>>;
```

Defined in: [use-working-tree.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L66)

Phase of the uncommitted changes; zero entries is `empty`.

***

### discard \{#discard\}

```ts
readonly discard: (options) => Promise<WorkingTreeDiscardResult>;
```

Defined in: [use-working-tree.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L103)

Resets the whole working tree back to HEAD; automatically re-reads status once after success.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`WorkingTreeCredentials`](../../rxdb-plugin-working-tree/interfaces/WorkingTreeCredentials.md) |

#### Returns

`Promise`&lt;[`WorkingTreeDiscardResult`](../../rxdb-plugin-working-tree/type-aliases/WorkingTreeDiscardResult.md)&gt;

***

### discardState \{#discardstate\}

```ts
readonly discardState: ComputedRef<WorkingTreeCommandState<WorkingTreeDiscardResult>>;
```

Defined in: [use-working-tree.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L74)

Phase of the last `discard()`; **no empty** — `discardedCount: 0` is a successful no-op.

***

### enable \{#enable\}

```ts
readonly enable: () => Promise<CommitCapabilityInfo>;
```

Defined in: [use-working-tree.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L89)

Enables the commit capability; automatically re-reads status once after success.

#### Returns

`Promise`&lt;[`CommitCapabilityInfo`](../../rxdb-plugin-working-tree/interfaces/CommitCapabilityInfo.md)&gt;

***

### enableIfEmpty \{#enableifempty\}

```ts
readonly enableIfEmpty: () => Promise<WorkingTreeEnableIfEmptyResult>;
```

Defined in: [use-working-tree.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L91)

Enables automatically when the database is empty and skips when it has content; re-reads status once after any of the three outcomes.

#### Returns

`Promise`&lt;[`WorkingTreeEnableIfEmptyResult`](../../rxdb-plugin-working-tree/type-aliases/WorkingTreeEnableIfEmptyResult.md)&gt;

***

### enableIfEmptyState \{#enableifemptystate\}

```ts
readonly enableIfEmptyState: ComputedRef<WorkingTreeCommandState<WorkingTreeEnableIfEmptyResult>>;
```

Defined in: [use-working-tree.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L62)

Phase of the last `enableIfEmpty()`; **no empty** — `not_empty` is a result, not "no content".

***

### enableState \{#enablestate\}

```ts
readonly enableState: ComputedRef<WorkingTreeCommandState<CommitCapabilityInfo>>;
```

Defined in: [use-working-tree.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L60)

Phase of the last `enable()`.

***

### isEnabled \{#isenabled\}

```ts
readonly isEnabled: () => Promise<boolean>;
```

Defined in: [use-working-tree.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L87)

Reads whether this database has the commit capability enabled.

#### Returns

`Promise`&lt;`boolean`&gt;

***

### isEnabledState \{#isenabledstate\}

```ts
readonly isEnabledState: ComputedRef<WorkingTreeCommandState<boolean>>;
```

Defined in: [use-working-tree.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L58)

Whether this database has the commit capability enabled; a `boolean` has no empty form, so there is **no empty phase**.

***

### listCommits \{#listcommits\}

```ts
readonly listCommits: (options?) => Promise<CommitLogPage>;
```

Defined in: [use-working-tree.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L97)

Reads the reachable commit history of the current branch.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`CommitLogOptions`](../../rxdb-plugin-working-tree/interfaces/CommitLogOptions.md) |

#### Returns

`Promise`&lt;[`CommitLogPage`](../../rxdb-plugin-working-tree/interfaces/CommitLogPage.md)&gt;

***

### listCommitsState \{#listcommitsstate\}

```ts
readonly listCommitsState: ComputedRef<WorkingTreeQueryState<CommitLogPage>>;
```

Defined in: [use-working-tree.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L68)

Phase of the commit history; an empty history is `empty`.

***

### restore \{#restore\}

```ts
readonly restore: (target, options) => Promise<WorkingTreeRestoreResult>;
```

Defined in: [use-working-tree.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L105)

Writes the content of a reachable historical commit back into the working tree; rejection comes back via the return value, not an exception. Status is re-read on both success and failure.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `target` | [`WorkingTreeRestoreTarget`](../../rxdb-plugin-working-tree/interfaces/WorkingTreeRestoreTarget.md) |
| `options` | [`WorkingTreeCredentials`](../../rxdb-plugin-working-tree/interfaces/WorkingTreeCredentials.md) |

#### Returns

`Promise`&lt;[`WorkingTreeRestoreResult`](../../rxdb-plugin-working-tree/type-aliases/WorkingTreeRestoreResult.md)&gt;

***

### restoreSession \{#restoresession\}

```ts
readonly restoreSession: () => Promise<
  | WorkingTreeRestoreSessionInfo
  | null>;
```

Defined in: [use-working-tree.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L110)

Reads the current branch's unfinished restore session; `null` when there is none.

#### Returns

`Promise`&lt;
  \| [`WorkingTreeRestoreSessionInfo`](../../rxdb-plugin-working-tree/interfaces/WorkingTreeRestoreSessionInfo.md)
  \| `null`&gt;

***

### restoreSessionState \{#restoresessionstate\}

```ts
readonly restoreSessionState: ComputedRef<WorkingTreeQueryState<
  | WorkingTreeRestoreSessionInfo
  | null>>;
```

Defined in: [use-working-tree.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L78)

Phase of the unfinished restore session; no session is `empty`, **carrying** that `null`.

***

### restoreState \{#restorestate\}

```ts
readonly restoreState: ComputedRef<WorkingTreeCommandState<WorkingTreeRestoreResult>>;
```

Defined in: [use-working-tree.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L76)

Phase of the last `restore()`; **no empty** — the four rejection reasons and `restoredCount: 0` are all results.

***

### status \{#status\}

```ts
readonly status: () => Promise<WorkingTreeStatus>;
```

Defined in: [use-working-tree.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L93)

Reads the working tree summary of the current branch.

#### Returns

`Promise`&lt;[`WorkingTreeStatus`](../../rxdb-plugin-working-tree/interfaces/WorkingTreeStatus.md)&gt;

***

### statusState \{#statusstate\}

```ts
readonly statusState: ComputedRef<WorkingTreeQueryState<WorkingTreeStatus>>;
```

Defined in: [use-working-tree.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L64)

Phase of the working tree summary; a clean working tree is `empty`, **carrying** that status.

***

### switchBranch \{#switchbranch\}

```ts
readonly switchBranch: (branchId, options?) => Promise<void>;
```

Defined in: [use-working-tree.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L112)

Switches to another branch; throws `WorkingTreeDirtyError` when rejected by `requireClean`. Automatically re-reads status once after success.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `branchId` | `string` |
| `options?` | [`RxDBBranchSwitchPreconditions`](../../rxdb/type-aliases/RxDBBranchSwitchPreconditions.md) |

#### Returns

`Promise`&lt;`void`&gt;

***

### switchBranchState \{#switchbranchstate\}

```ts
readonly switchBranchState: ComputedRef<WorkingTreeCommandState<void>>;
```

Defined in: [use-working-tree.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-vue/src/use-working-tree.ts#L80)

Phase of the last `switchBranch()`; **no empty** — switching to the current branch is a successful no-op.
