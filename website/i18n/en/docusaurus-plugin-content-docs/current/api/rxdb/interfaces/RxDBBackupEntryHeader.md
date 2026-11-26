# RxDBBackupEntryHeader

Defined in: [packages/rxdb/src/backup/backup-archive.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-archive.ts#L32)

The header of one entry in the archive.

## Properties

### kind \{#kind\}

```ts
readonly kind: "file" | "directory";
```

Defined in: [packages/rxdb/src/backup/backup-archive.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-archive.ts#L35)

---

### path \{#path\}

```ts
readonly path: string;
```

Defined in: [packages/rxdb/src/backup/backup-archive.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-archive.ts#L34)

A POSIX path relative to the engine data directory; does not start with `/` and contains no empty segments, `.`, `..`, backslashes, or NUL.

---

### size \{#size\}

```ts
readonly size: number;
```

Defined in: [packages/rxdb/src/backup/backup-archive.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-archive.ts#L37)

The file's byte count; always 0 for directories.
