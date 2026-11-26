# BranchMaterializationPageRequest

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L48)

What to tell the source side when requesting a page.

## Properties

### fromPageIndex \{#frompageindex\}

```ts
readonly fromPageIndex: number;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L62)

Which page to start from; non-zero when resuming

#### Remarks

This field is the whole of "resumable pulling": without it, resumption could only pull from the start again,
and the 900 pages left by an attempt that crashed at page 900 would be rewritten as-is — keeping them would then be pointless.

---

### intent \{#intent\}

```ts
readonly intent: BranchMaterializationIntent;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L53)

The intent frozen for this attempt; when resuming an old staging, it is byte-for-byte identical to the one frozen on that row

---

### previousPage \{#previouspage\}

```ts
readonly previousPage: BranchMaterializationPage | null;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L71)

The last page in the staging; `null` when pulling from the start

#### Remarks

The page order only says "which page", not "pulled up to where". The cursor lives in the source side's own payload and is handed back
as-is on resumption, so the source side does not have to keep a second copy of the progress elsewhere that could drift from the staging.

---

### targetBranchId \{#targetbranchid\}

```ts
readonly targetBranchId: string;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L50)

The id of the target branch to materialize
