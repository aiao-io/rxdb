# RepositorySyncStatus

Defined in: [packages/rxdb-plugin-sync/src/get-repository-sync-status.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/get-repository-sync-status.ts#L32)

Repository sync status

## Properties

### branchId \{#branchid\}

```ts
branchId: string;
```

Defined in: [packages/rxdb-plugin-sync/src/get-repository-sync-status.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/get-repository-sync-status.ts#L41)

Branch ID

***

### enabled \{#enabled\}

```ts
enabled: boolean;
```

Defined in: [packages/rxdb-plugin-sync/src/get-repository-sync-status.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/get-repository-sync-status.ts#L51)

Whether sync is enabled

***

### lastPulledAt \{#lastpulledat\}

```ts
lastPulledAt: Date | null;
```

Defined in: [packages/rxdb-plugin-sync/src/get-repository-sync-status.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/get-repository-sync-status.ts#L66)

The last pull timestamp

***

### lastPullRemoteChangeId \{#lastpullremotechangeid\}

```ts
lastPullRemoteChangeId: number | null;
```

Defined in: [packages/rxdb-plugin-sync/src/get-repository-sync-status.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/get-repository-sync-status.ts#L71)

The remote changeId of the last pull

***

### lastPushedAt \{#lastpushedat\}

```ts
lastPushedAt: Date | null;
```

Defined in: [packages/rxdb-plugin-sync/src/get-repository-sync-status.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/get-repository-sync-status.ts#L61)

The last push timestamp

***

### lastPushedChangeId \{#lastpushedchangeid\}

```ts
lastPushedChangeId: number | null;
```

Defined in: [packages/rxdb-plugin-sync/src/get-repository-sync-status.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/get-repository-sync-status.ts#L56)

The changeId of the last push

***

### pullableCount \{#pullablecount\}

```ts
pullableCount: number;
```

Defined in: [packages/rxdb-plugin-sync/src/get-repository-sync-status.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/get-repository-sync-status.ts#L81)

The number of changes available to pull

***

### pushableCount \{#pushablecount\}

```ts
pushableCount: number;
```

Defined in: [packages/rxdb-plugin-sync/src/get-repository-sync-status.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/get-repository-sync-status.ts#L76)

The number of changes awaiting push

***

### repository \{#repository\}

```ts
repository: RepositoryIdentifier;
```

Defined in: [packages/rxdb-plugin-sync/src/get-repository-sync-status.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/get-repository-sync-status.ts#L36)

The repository identifier

***

### syncType \{#synctype\}

```ts
syncType: SyncTypeValue;
```

Defined in: [packages/rxdb-plugin-sync/src/get-repository-sync-status.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/get-repository-sync-status.ts#L46)

The sync type
