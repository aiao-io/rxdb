# WorkingTreeDiff

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L115)

Everything one `diff()` answers (contracts/core-api.md §3).

## Properties

### baseHeadCommitId \{#baseheadcommitid\}

```ts
readonly baseHeadCommitId: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:120](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L120)

The comparison's left end: the commit the working tree is based on; `null` when the branch has no commits yet

***

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L117)

Which branch is being spread out

***

### entries \{#entries\}

```ts
readonly entries: readonly WorkingTreeDiffEntry[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L129)

The rows at entity granularity; always an empty array at transaction granularity

***

### granularity \{#granularity\}

```ts
readonly granularity: WorkingTreeDiffGranularity;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:126](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L126)

The granularity actually used this time

***

### nextCursor \{#nextcursor\}

```ts
readonly nextCursor: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:135](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L135)

The continuation cursor; `null` when this page has reached the end

***

### transactions \{#transactions\}

```ts
readonly transactions: readonly WorkingTreeDiffTransaction[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L132)

The groups at transaction granularity; always an empty array at entity granularity

***

### workingTreeRevision \{#workingtreerevision\}

```ts
readonly workingTreeRevision: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/diff.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L123)

The comparison's right end: the current working tree revision
