# CommitLogOptions

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L37)

The input of one `listCommits()` (contracts/core-api.md §5).

## Remarks

**All optional, and no `branchId`**: see this file's header. The four fields correspond character-for-character to `list-commits.ts`'s `ListCommitsOptions`; the one missing is exactly `branchId`.

## Properties

### entity? \{#entity\}

```ts
readonly entity?: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L48)

Only commits that touched this entity

---

### limit? \{#limit\}

```ts
readonly limit?: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L39)

At most how many to return from the HEAD end; without it, the whole reachable history is returned

---

### since? \{#since\}

```ts
readonly since?: Date;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L42)

Only commits whose database time ≥ it

---

### until? \{#until\}

```ts
readonly until?: Date;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-log.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-log.ts#L45)

Only commits whose database time ≤ it
