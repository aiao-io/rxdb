# CleanupExpiredResult

Defined in: [packages/rxdb-plugin-sync/src/cleanup-expired.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/cleanup-expired.ts#L55)

Expired data cleanup result

## Properties

### removed \{#removed\}

```ts
removed: number;
```

Defined in: [packages/rxdb-plugin-sync/src/cleanup-expired.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/cleanup-expired.ts#L59)

The number of cleaned-up records

***

### removedIds? \{#removedids\}

```ts
removedIds?: RxDBEntityId[];
```

Defined in: [packages/rxdb-plugin-sync/src/cleanup-expired.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/cleanup-expired.ts#L64)

The list of cleaned-up entity IDs (only in dryRun mode or on actual deletion)
