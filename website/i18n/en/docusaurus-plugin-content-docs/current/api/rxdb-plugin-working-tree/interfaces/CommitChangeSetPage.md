# CommitChangeSetPage

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-changes.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-changes.ts#L18)

One page returned by commitChanges: all change units of a commit, in write order.

## Properties

### commitId \{#commitid\}

```ts
readonly commitId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-changes.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-changes.ts#L20)

Which commit was read; verbatim identical to the input

---

### entries \{#entries\}

```ts
readonly entries: readonly CommitChangeUnitContent[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-changes.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-changes.ts#L22)

The change units of this commit; in ascending `sequence` order, already decoded by the codec
