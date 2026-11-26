# RxDBBackupArchiveWriter

Defined in: [packages/rxdb/src/backup/backup-archive.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-archive.ts#L136)

Streaming archive writer.

## Remarks

The call order is fixed: [writeManifest](#writemanifest) → some ([beginEntry](#beginentry) → [writeData](#writedata)*) → [finish](#finish).
Order violations, unsafe paths or written bytes not matching the declaration all report `invalid_state` — these are producer bugs,
and the writer must not produce an archive the reader is bound to reject. The writer does not close the underlying stream, `close()` / `abort()` are up to the caller.
After any step fails, the writer is voided and subsequent calls all report `invalid_state`.

## Example

```typescript
const writer = new RxDBBackupArchiveWriter(sink.getWriter(), signal);
await writer.writeManifest(manifest);
await writer.beginEntry({ path: 'PG_VERSION', kind: 'file', size: bytes.length });
await writer.writeData(bytes);
const trailer = await writer.finish();
```

## Constructors

### Constructor

```ts
new RxDBBackupArchiveWriter(sink, signal?): RxDBBackupArchiveWriter;
```

Defined in: [packages/rxdb/src/backup/backup-archive.ts:146](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-archive.ts#L146)

#### Parameters

| Parameter | Type                                                                       |
| --------- | -------------------------------------------------------------------------- |
| `sink`    | `WritableStreamDefaultWriter`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt; |
| `signal?` | `AbortSignal`                                                              |

#### Returns

`RxDBBackupArchiveWriter`

## Methods

### beginEntry() \{#beginentry\}

```ts
beginEntry(header): Promise<void>;
```

Defined in: [packages/rxdb/src/backup/backup-archive.ts:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-archive.ts#L171)

Begins an entry. The previous file must have been written to its declared byte count.

#### Parameters

| Parameter | Type                                                              | Description      |
| --------- | ----------------------------------------------------------------- | ---------------- |
| `header`  | [`RxDBBackupEntryHeader`](../interfaces/RxDBBackupEntryHeader.md) | The entry header |

#### Returns

`Promise`&lt;`void`&gt;

---

### finish() \{#finish\}

```ts
finish(): Promise<RxDBBackupTrailer>;
```

Defined in: [packages/rxdb/src/backup/backup-archive.ts:210](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-archive.ts#L210)

Writes the end marker. The end marker itself is not included in the digest.

#### Returns

`Promise`&lt;[`RxDBBackupTrailer`](../interfaces/RxDBBackupTrailer.md)&gt;

The end marker content

---

### writeData() \{#writedata\}

```ts
writeData(bytes): Promise<void>;
```

Defined in: [packages/rxdb/src/backup/backup-archive.ts:193](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-archive.ts#L193)

Writes a chunk of data of the current file; input exceeding [RXDB\_BACKUP\_CHUNK\_SIZE](../variables/RXDB_BACKUP_CHUNK_SIZE.md) is split into multiple frames.
The input buffer is only read, never mutated; the caller may reuse it after return.

#### Parameters

| Parameter | Type         | Description |
| --------- | ------------ | ----------- |
| `bytes`   | `Uint8Array` | The data    |

#### Returns

`Promise`&lt;`void`&gt;

---

### writeManifest() \{#writemanifest\}

```ts
writeManifest(manifest): Promise<void>;
```

Defined in: [packages/rxdb/src/backup/backup-archive.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup-archive.ts#L156)

Writes the magic number and the manifest. Must be the first call.

#### Parameters

| Parameter  | Type                                                        | Description      |
| ---------- | ----------------------------------------------------------- | ---------------- |
| `manifest` | [`RxDBBackupManifest`](../interfaces/RxDBBackupManifest.md) | Archive metadata |

#### Returns

`Promise`&lt;`void`&gt;
