# DESKTOP_HOST_MAX_FILE_CHUNK_BYTES

```ts
const DESKTOP_HOST_MAX_FILE_CHUNK_BYTES: number;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:33

Byte limit for one frame of file read/write.

## Remarks

Deliberately far smaller than [DESKTOP\_HOST\_MAX\_BLOB\_BYTES](DESKTOP_HOST_MAX_BLOB_BYTES.md): file content is moved frame by
frame, and one frame is the peak memory of one structured-clone operation. 4 MiB means even
gigabyte-scale files leave only one frame resident on the renderer heap, with the full content living
in the Blob backing store (US-504 AC#5).
