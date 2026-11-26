# SqliteLoadOptions

```ts
type SqliteLoadOptions = Pick<
  SqliteOfficialOptionsBase,
  | 'opfs'
  | 'wasmPath'
  | 'opfsProxyPath'
  | 'locateFile'
  | 'print'
  | 'printErr'
  | 'cacheSizeKb'
  | 'batchTimeout'
  | 'opfsFallback'
>;
```

Defined in: [packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite/src/sqlite-official.interface.ts#L57)

Runtime options accepted by `sqliteLoad`, excluding worker and repository configuration.
