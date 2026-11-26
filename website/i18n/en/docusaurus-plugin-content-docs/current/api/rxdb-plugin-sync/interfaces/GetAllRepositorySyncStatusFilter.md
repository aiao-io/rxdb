# GetAllRepositorySyncStatusFilter

Defined in: [packages/rxdb-plugin-sync/src/get-all-repository-sync-status.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/get-all-repository-sync-status.ts#L17)

The filter options of getAllRepositorySyncStatus

## Properties

### enabled? \{#enabled\}

```ts
enabled?: boolean;
```

Defined in: [packages/rxdb-plugin-sync/src/get-all-repository-sync-status.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/get-all-repository-sync-status.ts#L30)

Filter by enabled state
If true, only enabled repositories are returned
If false, only disabled repositories are returned
If undefined, everything is returned

---

### hasPendingChanges? \{#haspendingchanges\}

```ts
hasPendingChanges?: boolean;
```

Defined in: [packages/rxdb-plugin-sync/src/get-all-repository-sync-status.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/get-all-repository-sync-status.ts#L38)

Filter by pending changes
If true, only repositories with pushableCount \> 0 or pullableCount \> 0 are returned
If false, only repositories without pending changes are returned
If undefined, everything is returned

---

### syncType? \{#synctype\}

```ts
syncType?: SyncTypeValue[];
```

Defined in: [packages/rxdb-plugin-sync/src/get-all-repository-sync-status.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/get-all-repository-sync-status.ts#L22)

Filter by sync type
If provided, only repositories of these sync types are returned
