# BulkSyncResult

Defined in: [packages/rxdb-plugin-sync/src/bulk-sync.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/bulk-sync.ts#L65)

Bulk sync result

## Properties

### durationMs \{#durationms\}

```ts
durationMs: number;
```

Defined in: [packages/rxdb-plugin-sync/src/bulk-sync.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/bulk-sync.ts#L89)

Total elapsed time (milliseconds)

***

### failed \{#failed\}

```ts
failed: number;
```

Defined in: [packages/rxdb-plugin-sync/src/bulk-sync.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/bulk-sync.ts#L74)

The number of failed repositories

***

### results \{#results\}

```ts
results: object[];
```

Defined in: [packages/rxdb-plugin-sync/src/bulk-sync.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/bulk-sync.ts#L79)

The detailed result of each repository

#### error?

```ts
error?: Error;
```

#### repository

```ts
repository: RepositoryIdentifier;
```

#### result?

```ts
result?: SyncRepositoryResult;
```

#### success

```ts
success: boolean;
```

***

### succeeded \{#succeeded\}

```ts
succeeded: number;
```

Defined in: [packages/rxdb-plugin-sync/src/bulk-sync.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/bulk-sync.ts#L69)

The number of succeeded repositories
