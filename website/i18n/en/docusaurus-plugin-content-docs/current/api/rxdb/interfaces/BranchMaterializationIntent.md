# BranchMaterializationIntent

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L24)

The intent of one materialization: up to where to pull, and what to pull.

## Remarks

Both fields are **frozen values**, fixed by the source side in one shot before pulling starts (FR-049). If they
were not frozen, new data could arrive remotely mid-pagination and page 1 and page 9 would belong to two
different moments — the assembled baseline would be a state that never existed remotely.

It is also the **resume criterion**: after a crash, only the staging whose intent is word-for-word identical can
be continued.

## Properties

### frozenRemoteWatermark \{#frozenremotewatermark\}

```ts
readonly frozenRemoteWatermark: Record<string, unknown>;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L26)

The terminating watermark frozen for this run; its shape is up to the source side, and the working tree only
compares it key-order-independently.

---

### syncScope \{#syncscope\}

```ts
readonly syncScope: readonly string[];
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L29)

The complete sync scope (`namespace:entity`) to materialize this time; the order is the pagination order.
