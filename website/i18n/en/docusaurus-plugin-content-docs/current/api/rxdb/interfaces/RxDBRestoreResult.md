# RxDBRestoreResult

Defined in: [packages/rxdb/src/backup/backup.interface.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L121)

The result of a successful restore.

## Extends

- [`RxDBBackupTrailer`](RxDBBackupTrailer.md)

## Extended by

- [`PGliteRestoreResult`](../../rxdb-adapter-pglite/interfaces/PGliteRestoreResult.md)

## Properties

### bytes \{#bytes\}

```ts
readonly bytes: number;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L101)

Total bytes of the file data.

#### Inherited from

[`RxDBBackupTrailer`](RxDBBackupTrailer.md).[`bytes`](RxDBBackupTrailer.md#bytes)

***

### entries \{#entries\}

```ts
readonly entries: number;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L99)

Entry count (files + directories).

#### Inherited from

[`RxDBBackupTrailer`](RxDBBackupTrailer.md).[`entries`](RxDBBackupTrailer.md#entries)

***

### manifest \{#manifest\}

```ts
readonly manifest: RxDBBackupManifest;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L122)

***

### scope \{#scope\}

```ts
readonly scope: RxDBBackupScope;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L123)

***

### sha256 \{#sha256\}

```ts
readonly sha256: string;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L103)

The SHA-256 of all archive bytes before the end marker.

#### Inherited from

[`RxDBBackupTrailer`](RxDBBackupTrailer.md).[`sha256`](RxDBBackupTrailer.md#sha256)
