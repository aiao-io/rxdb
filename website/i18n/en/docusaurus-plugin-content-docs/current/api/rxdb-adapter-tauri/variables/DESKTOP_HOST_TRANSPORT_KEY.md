# DESKTOP_HOST_TRANSPORT_KEY

```ts
const DESKTOP_HOST_TRANSPORT_KEY: "__aiaoRxdbDesktopHost__" = "__aiaoRxdbDesktopHost__";
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:70

Key the preload uses when mounting the transport layer on the renderer global.

## Remarks

Under Electron it is injected via `contextBridge.exposeInMainWorld(DESKTOP_HOST_TRANSPORT_KEY, ...)`.
The package prefix in the name avoids colliding with the host application's own globals.
