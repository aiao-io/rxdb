# DESKTOP_HOST_TRANSPORT_KEY

```ts
const DESKTOP_HOST_TRANSPORT_KEY: "__aiaoRxdbDesktopHost__" = "__aiaoRxdbDesktopHost__";
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:70

Key the preload uses when mounting the transport on the renderer's global scope.

## Remarks

Under Electron it is injected via `contextBridge.exposeInMainWorld(DESKTOP_HOST_TRANSPORT_KEY, ...)`.
The name carries the package prefix to avoid colliding with the host app's own globals.
