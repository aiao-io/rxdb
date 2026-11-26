# LoadModuleOptions

```ts
type LoadModuleOptions = Pick<
  SqliteOptionsBase,
  'vfs' | 'async' | 'worker' | 'sharedWorker' | 'wasmPath' | 'locateFile' | 'cacheSizeKb' | 'batchTimeout'
>;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/sqlite.interface.ts#L82)

Configuration required for loading the wa-sqlite module and initializing the client.
