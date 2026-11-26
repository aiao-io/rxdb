# BranchMaterializationIntent

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L24)

The intent of one materialization: up to what point to pull, and what to pull.

## Remarks

Both fields are **frozen values**, fixed once by the source side before pulling starts (FR-049). Unfrozen, if new data arrives on the remote mid-pagination,
page 1 and page 9 belong to two different moments — the assembled baseline is a state that never existed on the remote.

It is also the **resumption criterion**: after a crash and restart, only the staging whose intent is literally identical can be continued.

## Properties

### frozenRemoteWatermark \{#frozenremotewatermark\}

```ts
readonly frozenRemoteWatermark: Record<string, unknown>;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L26)

The frozen terminal watermark for this run; the shape is defined by the source side, and the working tree only compares it key-order-insensitively

***

### syncScope \{#syncscope\}

```ts
readonly syncScope: readonly string[];
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L29)

The complete sync scope to materialize this time (`namespace:entity`), in pagination order
