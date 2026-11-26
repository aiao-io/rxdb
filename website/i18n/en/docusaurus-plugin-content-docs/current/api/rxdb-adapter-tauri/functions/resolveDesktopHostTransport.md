# resolveDesktopHostTransport()

```ts
function resolveDesktopHostTransport(): DesktopHostTransport;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:81

Reads the transport injected by the preload.

## Returns

[`DesktopHostTransport`](../interfaces/DesktopHostTransport.md)

The transport exposed by the preload

## Remarks

Only a complete bridge is accepted: a half-finished one exposing only `request` is harder to debug
than nothing at all, and it is better to stop it before connecting than to let an object with a
missing method run all the way to the first change push and explode there.

## Throws

[RxDBAdapterDesktopError](../classes/RxDBAdapterDesktopError.md) throws `host_unavailable` when nothing is injected or the bridge is incomplete
