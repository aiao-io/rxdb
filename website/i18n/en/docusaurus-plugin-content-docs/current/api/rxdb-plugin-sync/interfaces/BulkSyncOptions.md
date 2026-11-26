# BulkSyncOptions

Defined in: [packages/rxdb-plugin-sync/src/bulk-sync.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/bulk-sync.ts#L26)

Bulk sync options

## Properties

### concurrency? \{#concurrency\}

```ts
concurrency?: number;
```

Defined in: [packages/rxdb-plugin-sync/src/bulk-sync.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/bulk-sync.ts#L59)

Concurrency limit (only effective when concurrent=true)

#### Default

```ts
3
```

***

### concurrent? \{#concurrent\}

```ts
concurrent?: boolean;
```

Defined in: [packages/rxdb-plugin-sync/src/bulk-sync.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/bulk-sync.ts#L53)

Whether to run concurrently

#### Default

```ts
false
```

***

### operation? \{#operation\}

```ts
operation?: "push" | "pull" | "sync";
```

Defined in: [packages/rxdb-plugin-sync/src/bulk-sync.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/bulk-sync.ts#L31)

The sync operation type

#### Default

```ts
'sync'
```

***

### pull? \{#pull\}

```ts
pull?: PullRepositoryOptions;
```

Defined in: [packages/rxdb-plugin-sync/src/bulk-sync.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/bulk-sync.ts#L42)

Pull options (applied to all repositories)

***

### push? \{#push\}

```ts
push?: PushRepositoryOptions;
```

Defined in: [packages/rxdb-plugin-sync/src/bulk-sync.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/bulk-sync.ts#L47)

Push options (applied to all repositories)

***

### repositories? \{#repositories\}

```ts
repositories?: RepositoryIdentifier[];
```

Defined in: [packages/rxdb-plugin-sync/src/bulk-sync.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/bulk-sync.ts#L37)

The target repository list
If empty, all enabled repositories are synced
