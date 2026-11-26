# DESKTOP_HOST_MAX_FILE_CHUNK_BYTES

```ts
const DESKTOP_HOST_MAX_FILE_CHUNK_BYTES: number;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:33

Byte cap for a single frame of file read/write.

## Remarks

Deliberately much smaller than [DESKTOP\_HOST\_MAX\_BLOB\_BYTES](DESKTOP_HOST_MAX_BLOB_BYTES.md): file content moves frame by frame, and one frame is one structured clone's peak memory. At 4 MiB, even GB-scale files leave only one frame resident on the renderer heap, with the full content resting in the Blob backing store (US-504 AC#5).
