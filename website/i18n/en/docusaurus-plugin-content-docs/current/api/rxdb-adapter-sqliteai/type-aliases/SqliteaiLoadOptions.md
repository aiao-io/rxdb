# SqliteaiLoadOptions

```ts
type SqliteaiLoadOptions = Pick<SqliteaiOptionsBase, 
  | "opfs"
  | "wasmPath"
  | "opfsProxyPath"
  | "locateFile"
  | "print"
  | "printErr"
  | "cacheSizeKb"
  | "batchTimeout"
  | "opfsFallback">;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/sqliteai.interface.ts#L54)

The runtime option subset accepted by `sqliteaiLoad` (with worker / repository configuration stripped).
