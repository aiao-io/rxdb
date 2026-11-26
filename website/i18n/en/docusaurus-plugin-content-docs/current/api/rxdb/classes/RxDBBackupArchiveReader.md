# RxDBBackupArchiveReader

Defined in: [packages/rxdb/src/backup/backup-archive.ts:307](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-archive.ts#L307)

Streaming archive reader.

## Remarks

Call [readManifest](#readmanifest) first, then [next](#next) repeatedly until `end`. All structural problems are judged in place before being produced:
the magic number, frame types and ordering, the frame length cap (no waiting and no allocation when out of bounds), path safety and uniqueness, entry byte counts,
the end marker and SHA-256, and no bytes allowed after the end marker. Input exhausted before the end marker reports `truncated_archive`,
other corruption reports `corrupt_archive` with the position marked in `details.field`; failure of the input stream itself reports `io_error`.

The digest is only known at the very end, so the manifest and data are produced **before** the digest is verified — callers must
write them into a discardable staging area and only commit after `end`. The reader does not cancel the underlying stream; the caller disposes of it.

## Constructors

### Constructor

```ts
new RxDBBackupArchiveReader(source, signal?): RxDBBackupArchiveReader;
```

Defined in: [packages/rxdb/src/backup/backup-archive.ts:320](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-archive.ts#L320)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `source` | `ReadableStreamDefaultReader`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; |
| `signal?` | `AbortSignal` |

#### Returns

`RxDBBackupArchiveReader`

## Methods

### next() \{#next\}

```ts
next(): Promise<RxDBBackupArchiveItem>;
```

Defined in: [packages/rxdb/src/backup/backup-archive.ts:349](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-archive.ts#L349)

Reads the next item.

#### Returns

`Promise`&lt;[`RxDBBackupArchiveItem`](../type-aliases/RxDBBackupArchiveItem.md)&gt;

An entry header, a data chunk or the end

***

### readManifest() \{#readmanifest\}

```ts
readManifest(): Promise<RxDBBackupManifest>;
```

Defined in: [packages/rxdb/src/backup/backup-archive.ts:330](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-archive.ts#L330)

Reads and validates the magic number and the manifest structure (compatibility determination is the caller's responsibility).

#### Returns

`Promise`&lt;[`RxDBBackupManifest`](../interfaces/RxDBBackupManifest.md)&gt;

A structurally valid manifest
