# SyncStatus

Defined in: [packages/rxdb/src/repository/repository.interface.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/repository.interface.ts#L73)

Sync status enumeration

- `Synced`: the watermark is aligned or there are no local unpushed changes;
- `Syncing`: a `pull()` / `push()` call is in progress;
- `Never`: no sync has ever been initiated since the last initialization.

Computed by getRepositorySyncStatus,
for the UI to show "whether the data is up to date".

## Enumeration Members

### Never \{#never\}

```ts
Never: 'Never';
```

Defined in: [packages/rxdb/src/repository/repository.interface.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/repository.interface.ts#L87)

Never synced

---

### Synced \{#synced\}

```ts
Synced: 'Synced';
```

Defined in: [packages/rxdb/src/repository/repository.interface.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/repository.interface.ts#L77)

Synced

---

### Syncing \{#syncing\}

```ts
Syncing: 'Syncing';
```

Defined in: [packages/rxdb/src/repository/repository.interface.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/repository.interface.ts#L82)

Syncing
