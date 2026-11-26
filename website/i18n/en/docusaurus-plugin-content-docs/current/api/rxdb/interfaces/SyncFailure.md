# SyncFailure

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L38)

The sync failure record of a single repository

## Properties

### error \{#error\}

```ts
error: Error;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L47)

The root cause of the failure (nested `RxDBPartialSyncError`s already unwrapped)

---

### repository? \{#repository\}

```ts
repository?: RepositoryIdentifier;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.interface.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.interface.ts#L42)

The identifier of the failed repository (always present in repository-level aggregation scenarios)
