# DesktopHostRequest

```ts
type DesktopHostRequest =
  | DesktopHostHandshakeRequest
  | DesktopHostOpenRequest
  | DesktopHostExecuteRequest
  | DesktopHostVersionRequest
  | DesktopHostCloseRequest
  | DesktopHostMuteRequest
  | DesktopHostDropRequest;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:158

All requests the renderer can send to the host.
