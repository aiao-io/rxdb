# BranchMaterializationPageRequest

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L48)

What to tell the source when asking for pages.

## Properties

### fromPageIndex \{#frompageindex\}

```ts
readonly fromPageIndex: number;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L62)

Which page to start giving from; not 0 on a continuation

#### Remarks

This one cell is the whole of "resumable pull": without it a continuation could only pull from the start again, and the 900 pages left by an attempt
that crashed on page 900 would be rewritten as-is — keeping them would then be pointless.

---

### intent \{#intent\}

```ts
readonly intent: BranchMaterializationIntent;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L53)

The intent frozen by this run; when continuing an old staging, it is verbatim the same as the one frozen on that row

---

### previousPage \{#previouspage\}

```ts
readonly previousPage: BranchMaterializationPage | null;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L71)

The last page in the staging; `null` when pulling from the start

#### Remarks

Page order only says "which page", not "up to where". The cursor lives in the source's own payload and is handed back as-is on continuation,
so the source never keeps a second copy of progress elsewhere that could drift from the staging.

---

### targetBranchId \{#targetbranchid\}

```ts
readonly targetBranchId: string;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L50)

The id of the target branch to materialize
