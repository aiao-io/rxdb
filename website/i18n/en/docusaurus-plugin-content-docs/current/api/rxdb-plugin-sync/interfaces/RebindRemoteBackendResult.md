# RebindRemoteBackendResult

Defined in: [packages/rxdb-plugin-sync/src/remote-backend.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/remote-backend.ts#L51)

The result of `SyncManager.rebindRemoteBackend()`

## Properties

### backendId \{#backendid\}

```ts
backendId: string;
```

Defined in: [packages/rxdb-plugin-sync/src/remote-backend.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/remote-backend.ts#L53)

The remote identity rebound to

***

### previousBackendIds \{#previousbackendids\}

```ts
previousBackendIds: string[];
```

Defined in: [packages/rxdb-plugin-sync/src/remote-backend.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/remote-backend.ts#L55)

The replaced old identities (de-duplicated); records that were originally unbound are not counted

***

### rebound \{#rebound\}

```ts
rebound: number;
```

Defined in: [packages/rxdb-plugin-sync/src/remote-backend.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/remote-backend.ts#L57)

The number of sync records whose pull cursors were cleared and rebound
