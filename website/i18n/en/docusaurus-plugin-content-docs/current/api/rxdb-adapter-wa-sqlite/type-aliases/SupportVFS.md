# SupportVFS

```ts
type SupportVFS =
  | 'MemoryVFS'
  | 'MemoryAsyncVFS'
  | 'IDBBatchAtomicVFS'
  | 'IDBMirrorVFS'
  | 'AccessHandlePoolVFS'
  | 'OPFSAdaptiveVFS'
  | 'OPFSAnyContextVFS'
  | 'OPFSCoopSyncVFS'
  | 'OPFSWriteAheadVFS';
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts#L8)

Supported virtual filesystem types.
