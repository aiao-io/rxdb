# RxDBBackupTrailer

Defined in: [packages/rxdb/src/backup/backup.interface.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L97)

The summary in the archive's end marker.

## Extended by

- [`RxDBBackupResult`](RxDBBackupResult.md)
- [`RxDBRestoreResult`](RxDBRestoreResult.md)

## Properties

### bytes \{#bytes\}

```ts
readonly bytes: number;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L101)

Total byte count of the file data.

***

### entries \{#entries\}

```ts
readonly entries: number;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L99)

Entry count (files + directories).

***

### sha256 \{#sha256\}

```ts
readonly sha256: string;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L103)

The SHA-256 of all archive bytes before the end marker.
