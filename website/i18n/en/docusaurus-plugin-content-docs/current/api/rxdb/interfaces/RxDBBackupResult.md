# RxDBBackupResult

Defined in: [packages/rxdb/src/backup/backup.interface.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L113)

The result of a successful backup.

## Remarks

Returned only after the archive has been fully written and the output side's `WritableStream.close()` has resolved.
Persistence after the output side closes (e.g. writing to disk, uploading) is the responsibility of the caller-provided stream.

## Extends

- [`RxDBBackupTrailer`](RxDBBackupTrailer.md)

## Properties

### bytes \{#bytes\}

```ts
readonly bytes: number;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L101)

Total number of file data bytes.

#### Inherited from

[`RxDBBackupTrailer`](RxDBBackupTrailer.md).[`bytes`](RxDBBackupTrailer.md#bytes)

---

### entries \{#entries\}

```ts
readonly entries: number;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L99)

Number of entries (files + directories).

#### Inherited from

[`RxDBBackupTrailer`](RxDBBackupTrailer.md).[`entries`](RxDBBackupTrailer.md#entries)

---

### manifest \{#manifest\}

```ts
readonly manifest: RxDBBackupManifest;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:114](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L114)

---

### scope \{#scope\}

```ts
readonly scope: RxDBBackupScope;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L115)

---

### sha256 \{#sha256\}

```ts
readonly sha256: string;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L103)

SHA-256 of all archive bytes before the end marker.

#### Inherited from

[`RxDBBackupTrailer`](RxDBBackupTrailer.md).[`sha256`](RxDBBackupTrailer.md#sha256)
