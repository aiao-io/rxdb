# DesktopHostFileRequest

```ts
type DesktopHostFileRequest = 
  | DesktopHostFileOpenRequest
  | DesktopHostFileCloseRequest
  | DesktopHostFilePathRequest
  | DesktopHostFileMoveRequest
  | DesktopHostFileReadRequest
  | DesktopHostFileWriteBeginRequest
  | DesktopHostFileWriteChunkRequest
  | DesktopHostFileWriteFinishRequest
  | DesktopHostFileLockAcquireRequest
  | DesktopHostFileLockReleaseRequest;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:316

All requests the renderer can send to the file host.
