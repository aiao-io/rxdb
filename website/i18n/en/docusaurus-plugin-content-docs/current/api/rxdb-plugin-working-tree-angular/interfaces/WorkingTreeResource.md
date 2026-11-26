# WorkingTreeResource

Defined in: [use-working-tree.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L61)

Return value of [useWorkingTree](../functions/useWorkingTree.md).

## Remarks

The fourteen state fields correspond one-to-one with the core `WorkingTreeAsyncStates`, each wrapped in its own `Signal`: when a template only reads `statusState`, a phase change from one `diff()` call does not make it re-evaluate. The fourteen method signatures are exactly the same as the same-named methods on the plugin package's `WorkingTreeManager` (the `switchBranch` one is on `VersionManager`) — parameters and return values use the types from `@aiao/rxdb-plugin-working-tree`; this package **does not redefine them** (tri-framework-api.md §1).

Equivalent implementations across the three frameworks: React `useWorkingTree()` (render snapshot), Vue `useWorkingTree()` (`ComputedRef`); field names, method names and semantics are exactly the same, only the container form differs. The entry point binds the database injected at creation time: the database in an injector never changes, so switching databases means rebuilding the component (the React version resets itself when the Provider switches databases).

The four rejection reasons of `restore()` come back via the **return value** rather than exceptions, so `restoreState` also has **no empty**: "rejected" and "nothing restored" are both results, not "no result". The emptiness of `restoreSessionState` has exactly one meaning — the current branch has no unfinished restore session; a `conflicted` session is still **not** empty, it still holds the unique index and still blocks the next restore.

`WorkingTreeSwitchBranchOptions` of `switchBranch(branchId, options?)` is wired in by T123: without the second argument it is byte-for-byte identical to today (unconditional switch), and `{ requireClean: true }` **throws** `WorkingTreeDirtyError` when the working tree is not clean — rejection is not a return value, because at that moment the branch was never switched.

## Properties

### checkBranchFromCommit \{#checkbranchfromcommit\}

```ts
readonly checkBranchFromCommit: (commitId) => Promise<WorkingTreeBranchFromCommitCheck>;
```

Defined in: [use-working-tree.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L119)

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
readonly checkBranchFromCommitState: Signal<WorkingTreeCommandState<WorkingTreeBranchFromCommitCheck>>;
```

Defined in: [use-working-tree.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L87)

Phase of the last `checkBranchFromCommit()`; **no empty** — being able to create and the three rejection reasons are all results.

***

### commit \{#commit\}

```ts
readonly commit: (message, options) => Promise<CommitResult>;
```

Defined in: [use-working-tree.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L106)

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

Defined in: [use-working-tree.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L104)

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
readonly commitChangesState: Signal<WorkingTreeQueryState<CommitChangeSetPage>>;
```

Defined in: [use-working-tree.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L75)

Phase of a single commit's change set; zero change units (a baseline node) is `empty`.

***

### commitState \{#commitstate\}

```ts
readonly commitState: Signal<WorkingTreeCommandState<CommitResult>>;
```

Defined in: [use-working-tree.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L77)

Phase of the last `commit()`; **no empty** — zero uncommitted changes is an `empty_commit` error.

***

### createBranchFromCommit \{#createbranchfromcommit\}

```ts
readonly createBranchFromCommit: (branchId, commitId) => Promise<WorkingTreeCreateBranchFromCommitResult>;
```

Defined in: [use-working-tree.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L121)

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
readonly createBranchFromCommitState: Signal<WorkingTreeCommandState<WorkingTreeCreateBranchFromCommitResult>>;
```

Defined in: [use-working-tree.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L89)

Phase of the last `createBranchFromCommit()`; **no empty** — a successful creation and the three rejection reasons are all results.

***

### diff \{#diff\}

```ts
readonly diff: (options?) => Promise<WorkingTreeDiff>;
```

Defined in: [use-working-tree.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L100)

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
readonly diffState: Signal<WorkingTreeQueryState<WorkingTreeDiff>>;
```

Defined in: [use-working-tree.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L71)

Phase of the uncommitted changes; zero entries is `empty`.

***

### discard \{#discard\}

```ts
readonly discard: (options) => Promise<WorkingTreeDiscardResult>;
```

Defined in: [use-working-tree.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L108)

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
readonly discardState: Signal<WorkingTreeCommandState<WorkingTreeDiscardResult>>;
```

Defined in: [use-working-tree.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L79)

Phase of the last `discard()`; **no empty** — `discardedCount: 0` is a successful no-op.

***

### enable \{#enable\}

```ts
readonly enable: () => Promise<CommitCapabilityInfo>;
```

Defined in: [use-working-tree.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L94)

Enables the commit capability; automatically re-reads status once after success.

#### Returns

`Promise`&lt;[`CommitCapabilityInfo`](../../rxdb-plugin-working-tree/interfaces/CommitCapabilityInfo.md)&gt;

***

### enableIfEmpty \{#enableifempty\}

```ts
readonly enableIfEmpty: () => Promise<WorkingTreeEnableIfEmptyResult>;
```

Defined in: [use-working-tree.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L96)

Enables automatically when the database is empty and skips when it has content; re-reads status once after any of the three outcomes.

#### Returns

`Promise`&lt;[`WorkingTreeEnableIfEmptyResult`](../../rxdb-plugin-working-tree/type-aliases/WorkingTreeEnableIfEmptyResult.md)&gt;

***

### enableIfEmptyState \{#enableifemptystate\}

```ts
readonly enableIfEmptyState: Signal<WorkingTreeCommandState<WorkingTreeEnableIfEmptyResult>>;
```

Defined in: [use-working-tree.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L67)

Phase of the last `enableIfEmpty()`; **no empty** — `not_empty` is a result, not "no content".

***

### enableState \{#enablestate\}

```ts
readonly enableState: Signal<WorkingTreeCommandState<CommitCapabilityInfo>>;
```

Defined in: [use-working-tree.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L65)

Phase of the last `enable()`.

***

### isEnabled \{#isenabled\}

```ts
readonly isEnabled: () => Promise<boolean>;
```

Defined in: [use-working-tree.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L92)

Reads whether this database has the commit capability enabled.

#### Returns

`Promise`&lt;`boolean`&gt;

***

### isEnabledState \{#isenabledstate\}

```ts
readonly isEnabledState: Signal<WorkingTreeCommandState<boolean>>;
```

Defined in: [use-working-tree.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L63)

Whether this database has the commit capability enabled; a `boolean` has no empty form, so there is **no empty phase**.

***

### listCommits \{#listcommits\}

```ts
readonly listCommits: (options?) => Promise<CommitLogPage>;
```

Defined in: [use-working-tree.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L102)

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
readonly listCommitsState: Signal<WorkingTreeQueryState<CommitLogPage>>;
```

Defined in: [use-working-tree.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L73)

Phase of the commit history; an empty history is `empty`.

***

### restore \{#restore\}

```ts
readonly restore: (target, options) => Promise<WorkingTreeRestoreResult>;
```

Defined in: [use-working-tree.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L110)

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

Defined in: [use-working-tree.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L115)

Reads the current branch's unfinished restore session; `null` when there is none.

#### Returns

`Promise`&lt;
  \| [`WorkingTreeRestoreSessionInfo`](../../rxdb-plugin-working-tree/interfaces/WorkingTreeRestoreSessionInfo.md)
  \| `null`&gt;

***

### restoreSessionState \{#restoresessionstate\}

```ts
readonly restoreSessionState: Signal<WorkingTreeQueryState<
  | WorkingTreeRestoreSessionInfo
  | null>>;
```

Defined in: [use-working-tree.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L83)

Phase of the unfinished restore session; no session is `empty`, **carrying** that `null`.

***

### restoreState \{#restorestate\}

```ts
readonly restoreState: Signal<WorkingTreeCommandState<WorkingTreeRestoreResult>>;
```

Defined in: [use-working-tree.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L81)

Phase of the last `restore()`; **no empty** — the four rejection reasons and `restoredCount: 0` are all results.

***

### status \{#status\}

```ts
readonly status: () => Promise<WorkingTreeStatus>;
```

Defined in: [use-working-tree.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L98)

Reads the working tree summary of the current branch.

#### Returns

`Promise`&lt;[`WorkingTreeStatus`](../../rxdb-plugin-working-tree/interfaces/WorkingTreeStatus.md)&gt;

***

### statusState \{#statusstate\}

```ts
readonly statusState: Signal<WorkingTreeQueryState<WorkingTreeStatus>>;
```

Defined in: [use-working-tree.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L69)

Phase of the working tree summary; a clean working tree is `empty`, **carrying** that status.

***

### switchBranch \{#switchbranch\}

```ts
readonly switchBranch: (branchId, options?) => Promise<void>;
```

Defined in: [use-working-tree.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L117)

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
readonly switchBranchState: Signal<WorkingTreeCommandState<void>>;
```

Defined in: [use-working-tree.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L85)

Phase of the last `switchBranch()`; **no empty** — switching to the current branch is a successful no-op.
