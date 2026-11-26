# SqliteSupportedBackupStorage

```ts
type SqliteSupportedBackupStorage = Exclude<
  SqliteBackupStorage,
  {
    kind: 'unsupported';
  }
>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.interface.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.interface.ts#L47)

Storage backends for which backup and restore have been delivered.
