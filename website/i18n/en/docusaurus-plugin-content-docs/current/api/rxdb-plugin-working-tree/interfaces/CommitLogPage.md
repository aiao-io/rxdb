# CommitLogPage

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L94)

The result of one `listCommits()` call.

## Remarks

An empty `entries` is a **semantically empty** result (this branch has no history yet), which makes it one of the two sources
of the three frameworks' empty states (tri-framework-api.md §4). A database that just finished `0004` and has never committed
is in exactly this state — it is not an error.

## Properties

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L96)

Which branch this page reads; always the active branch at read time

---

### entries \{#entries\}

```ts
readonly entries: readonly CommitLogEntry[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L102)

The commit nodes, newest first

---

### headCommitId \{#headcommitid\}

```ts
readonly headCommitId: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L99)

The branch's current HEAD; `null` when it has never committed
