# WorkingTreeCredentials

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L78)

The three positions captured by the caller at read time (FR-020/FR-031).

## Remarks

Both `commit()`'s and `discard()`'s option types extend it rather than each declaring the three fields: two declarations would eventually
diverge at some addition, and "the two commands use the same set of credentials" is exactly the premise that lets callers feed one
`status()` result to both.

All three fields are **required**. Defaults would let callers skip one of the comparisons, and skipping any one
falls back to the degenerate form described in item 1 above.

## Extended by

- [`CommitOptions`](CommitOptions.md)

## Properties

### expectedBranch \{#expectedbranch\}

```ts
readonly expectedBranch: ActiveBranchToken;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L80)

The active branch identity at capture time

***

### expectedHeadRevision \{#expectedheadrevision\}

```ts
readonly expectedHeadRevision: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L83)

The HEAD advance revision at capture time

***

### expectedWorkingTreeRevision \{#expectedworkingtreerevision\}

```ts
readonly expectedWorkingTreeRevision: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L86)

The working tree revision at capture time
