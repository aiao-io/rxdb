# RXDB_BACKUP_CHUNK_SIZE

```ts
const RXDB_BACKUP_CHUNK_SIZE: number;
```

Defined in: [packages/rxdb/src/backup/backup-archive.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-archive.ts#L13)

Maximum payload of a single data frame (64 KiB).

## Remarks

The writer slices input of any size into frames no larger than this, and the reader rejects larger frames — this is the source of the memory bound on both ends: no matter how large the database is, the codec layer holds at most one frame plus one chunk of the input stream at a time.
