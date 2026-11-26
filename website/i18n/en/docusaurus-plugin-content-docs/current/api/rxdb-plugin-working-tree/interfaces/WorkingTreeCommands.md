# WorkingTreeCommands

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L77)

The fourteen commands exposed by the three-framework entry points; the signatures match the same-named methods on [WorkingTreeManager](../classes/WorkingTreeManager.md)
(and, for `switchBranch`, on [VersionManager](../../rxdb-plugin-history/interfaces/VersionManager.md)).

## Remarks

**Signatures are not framework-rewritten**: both parameters and return values use the core's types (§1 "share the same core types, no per-framework redefinition"). `commit()` here is likewise "two positional parameters, CAS failure goes through the return value", with no overload that drops the three capture positions for the sake of "ergonomics" — dropping them would mean the entry point reads the revision internally, and what it reads internally always equals the current value, so the CAS always hits (FR-031 fails on the spot).

## Properties

### checkBranchFromCommit \{#checkbranchfromcommit\}

```ts
readonly checkBranchFromCommit: (commitId) => Promise<WorkingTreeBranchFromCommitCheck>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L106)

Judges whether a reachable commit can be used to create a branch; the three rejection causes go through the return value, not exceptions

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `commitId` | `string` |

#### Returns

`Promise`&lt;[`WorkingTreeBranchFromCommitCheck`](../type-aliases/WorkingTreeBranchFromCommitCheck.md)&gt;

---

### commit \{#commit\}

```ts
readonly commit: (message, options) => Promise<CommitResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L93)

Commits all uncommitted units in the working tree; **there is no "empty success"** — with zero changes it throws `empty_commit` as-is

#### Parameters

| Parameter | Type                                |
| --------- | ----------------------------------- |
| `message` | `string`                            |
| `options` | [`CommitOptions`](CommitOptions.md) |

#### Returns

`Promise`&lt;[`CommitResult`](../type-aliases/CommitResult.md)&gt;

---

### commitChanges \{#commitchanges\}

```ts
readonly commitChanges: (commitId) => Promise<CommitChangeSetPage>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L91)

All change units of a commit; the zero units of a baseline node are the `empty` phase

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `commitId` | `string` |

#### Returns

`Promise`&lt;[`CommitChangeSetPage`](CommitChangeSetPage.md)&gt;

---

### createBranchFromCommit \{#createbranchfromcommit\}

```ts
readonly createBranchFromCommit: (branchId, commitId) => Promise<WorkingTreeCreateBranchFromCommitResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L108)

Creates a branch from a reachable commit without switching; the three rejection causes go through the return value, not exceptions

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `branchId` | `string` |
| `commitId` | `string` |

#### Returns

`Promise`&lt;[`WorkingTreeCreateBranchFromCommitResult`](../type-aliases/WorkingTreeCreateBranchFromCommitResult.md)&gt;

---

### diff \{#diff\}

```ts
readonly diff: (options?) => Promise<WorkingTreeDiff>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L87)

The uncommitted changes of the current branch relative to HEAD; zero entries are the `empty` phase

#### Parameters

| Parameter  | Type                                                  |
| ---------- | ----------------------------------------------------- |
| `options?` | [`WorkingTreeDiffOptions`](WorkingTreeDiffOptions.md) |

#### Returns

`Promise`&lt;[`WorkingTreeDiff`](WorkingTreeDiff.md)&gt;

---

### discard \{#discard\}

```ts
readonly discard: (options) => Promise<WorkingTreeDiscardResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L95)

Resets the working tree as a whole back to HEAD; `discardedCount: 0` is a no-op, not empty

#### Parameters

| Parameter | Type                                                  |
| --------- | ----------------------------------------------------- |
| `options` | [`WorkingTreeCredentials`](WorkingTreeCredentials.md) |

#### Returns

`Promise`&lt;[`WorkingTreeDiscardResult`](../type-aliases/WorkingTreeDiscardResult.md)&gt;

---

### enable \{#enable\}

```ts
readonly enable: () => Promise<CommitCapabilityInfo>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L81)

Enables the commit capability; on success, also re-reads status once

#### Returns

`Promise`&lt;[`CommitCapabilityInfo`](CommitCapabilityInfo.md)&gt;

---

### enableIfEmpty \{#enableifempty\}

```ts
readonly enableIfEmpty: () => Promise<WorkingTreeEnableIfEmptyResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L83)

Enables automatically when the database is empty, skips when it has content; after any of the three outcomes, also re-reads status once

#### Returns

`Promise`&lt;[`WorkingTreeEnableIfEmptyResult`](../type-aliases/WorkingTreeEnableIfEmptyResult.md)&gt;

---

### isEnabled \{#isenabled\}

```ts
readonly isEnabled: () => Promise<boolean>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L79)

Whether this database has the commit capability enabled; `boolean` has no empty shape, so it goes through the command state

#### Returns

`Promise`&lt;`boolean`&gt;

---

### listCommits \{#listcommits\}

```ts
readonly listCommits: (options?) => Promise<CommitLogPage>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L89)

The reachable commit history of the current branch; an empty history is the `empty` phase

#### Parameters

| Parameter  | Type                                      |
| ---------- | ----------------------------------------- |
| `options?` | [`CommitLogOptions`](CommitLogOptions.md) |

#### Returns

`Promise`&lt;[`CommitLogPage`](CommitLogPage.md)&gt;

---

### restore \{#restore\}

```ts
readonly restore: (target, options) => Promise<WorkingTreeRestoreResult>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L97)

Writes the content of a reachable history commit back into the working tree; the four rejection causes go through the return value, not exceptions

#### Parameters

| Parameter | Type                                                      |
| --------- | --------------------------------------------------------- |
| `target`  | [`WorkingTreeRestoreTarget`](WorkingTreeRestoreTarget.md) |
| `options` | [`WorkingTreeCredentials`](WorkingTreeCredentials.md)     |

#### Returns

`Promise`&lt;[`WorkingTreeRestoreResult`](../type-aliases/WorkingTreeRestoreResult.md)&gt;

---

### restoreSession \{#restoresession\}

```ts
readonly restoreSession: () => Promise<
  | WorkingTreeRestoreSessionInfo
  | null>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L102)

The current branch's unfinished restore session; `null` when there is none, which falls on the `empty` phase

#### Returns

`Promise`&lt;
\| [`WorkingTreeRestoreSessionInfo`](WorkingTreeRestoreSessionInfo.md)
\| `null`&gt;

---

### status \{#status\}

```ts
readonly status: () => Promise<WorkingTreeStatus>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L85)

The working tree summary of the current branch; a clean working tree is the `empty` phase

#### Returns

`Promise`&lt;[`WorkingTreeStatus`](WorkingTreeStatus.md)&gt;

---

### switchBranch \{#switchbranch\}

```ts
readonly switchBranch: (branchId, options?) => Promise<void>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L104)

Switches to another branch; on success, also re-reads status once. When rejected by `requireClean`, it **throws** `WorkingTreeDirtyError`

#### Parameters

| Parameter  | Type                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------- |
| `branchId` | `string`                                                                                    |
| `options?` | [`RxDBBranchSwitchPreconditions`](../../rxdb/type-aliases/RxDBBranchSwitchPreconditions.md) |

#### Returns

`Promise`&lt;`void`&gt;
