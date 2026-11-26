# PGliteDataDirItem

```ts
type PGliteDataDirItem = Exclude<
  RxDBBackupArchiveItem,
  {
    type: 'end';
  }
>;
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/pglite-data-dir.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/pglite-data-dir.ts#L58)

One item in a data directory snapshot: an entry header for a directory or file, or a chunk of content following a file entry header.

## Remarks

Same shape as the archive reader's output (minus the end marker). On the browser side it comes from traversing the Emscripten filesystem; on the desktop the host streams it back to the renderer chunk by chunk. Both sides hand it to writeDataDirSnapshot to write into the archive. The bytes of `data` are only valid until the next item is fetched: producers may reuse the same buffer.
