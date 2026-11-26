# WorkingTreeCredentials

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L78)

The three positions the caller captured at read time (FR-020/FR-031).

## Remarks

`commit()` and `discard()`'s option types both inherit it rather than writing the three fields once each: two declarations eventually diverge at some future addition, while "both commands use the same credential set" is exactly what lets the caller feed one `status()` result to both.

All three fields are **required**. Defaults would let the caller skip some comparison, and skipping any one falls back into the degenerate shape described in point 1 above.

## Extended by

- [`CommitOptions`](CommitOptions.md)

## Properties

### expectedBranch \{#expectedbranch\}

```ts
readonly expectedBranch: ActiveBranchToken;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L80)

The active branch identity at capture time

---

### expectedHeadRevision \{#expectedheadrevision\}

```ts
readonly expectedHeadRevision: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L83)

The HEAD advance revision at capture time

---

### expectedWorkingTreeRevision \{#expectedworkingtreerevision\}

```ts
readonly expectedWorkingTreeRevision: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L86)

The working tree revision at capture time
