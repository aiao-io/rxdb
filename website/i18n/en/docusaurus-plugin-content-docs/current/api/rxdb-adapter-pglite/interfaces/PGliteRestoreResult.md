# PGliteRestoreResult

Defined in: [packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts#L76)

PGlite restore result.

## Extends

- [`RxDBRestoreResult`](../../rxdb/interfaces/RxDBRestoreResult.md)

## Properties

### bytes \{#bytes\}

```ts
readonly bytes: number;
```

Defined in: packages/rxdb/dist/backup/backup.interface.d.ts:94

Total number of bytes of file data.

#### Inherited from

[`RxDBRestoreResult`](../../rxdb/interfaces/RxDBRestoreResult.md).[`bytes`](../../rxdb/interfaces/RxDBRestoreResult.md#bytes)

***

### database? \{#database\}

```ts
readonly database?: PGliteRestoredDatabase;
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts#L81)

The database restored to a memory target, to be claimed via [PGliteClientOptions.restoredDatabase](PGliteClientOptions.md#restoreddatabase); for IndexedDB targets the data is already in storage and this is empty.

***

### entries \{#entries\}

```ts
readonly entries: number;
```

Defined in: packages/rxdb/dist/backup/backup.interface.d.ts:92

Number of entries (files + directories).

#### Inherited from

[`RxDBRestoreResult`](../../rxdb/interfaces/RxDBRestoreResult.md).[`entries`](../../rxdb/interfaces/RxDBRestoreResult.md#entries)

***

### manifest \{#manifest\}

```ts
readonly manifest: RxDBBackupManifest;
```

Defined in: packages/rxdb/dist/backup/backup.interface.d.ts:113

#### Inherited from

[`RxDBRestoreResult`](../../rxdb/interfaces/RxDBRestoreResult.md).[`manifest`](../../rxdb/interfaces/RxDBRestoreResult.md#manifest)

***

### scope \{#scope\}

```ts
readonly scope: RxDBBackupScope;
```

Defined in: packages/rxdb/dist/backup/backup.interface.d.ts:114

#### Inherited from

[`RxDBRestoreResult`](../../rxdb/interfaces/RxDBRestoreResult.md).[`scope`](../../rxdb/interfaces/RxDBRestoreResult.md#scope)

***

### sha256 \{#sha256\}

```ts
readonly sha256: string;
```

Defined in: packages/rxdb/dist/backup/backup.interface.d.ts:96

SHA-256 of all archive bytes before the end marker.

#### Inherited from

[`RxDBRestoreResult`](../../rxdb/interfaces/RxDBRestoreResult.md).[`sha256`](../../rxdb/interfaces/RxDBRestoreResult.md#sha256)
