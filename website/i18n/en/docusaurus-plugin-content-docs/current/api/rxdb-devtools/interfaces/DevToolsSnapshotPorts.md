# DevToolsSnapshotPorts

Defined in: [provider/snapshot.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L80)

External dependencies required to construct the snapshot repository.

## Properties

### clock \{#clock\}

```ts
readonly clock: DevToolsClock;
```

Defined in: [provider/snapshot.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L82)

The time port; both the 15-second end-to-end deadline and the 60-second cursor expiry go
through it.

***

### source \{#source\}

```ts
readonly source: DevToolsSnapshotSource;
```

Defined in: [provider/snapshot.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L84)

The materialization source, provided by whoever holds the storage-wide exclusive lock.
