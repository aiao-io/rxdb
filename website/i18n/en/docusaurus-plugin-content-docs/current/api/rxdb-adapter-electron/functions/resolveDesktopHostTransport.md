# resolveDesktopHostTransport()

```ts
function resolveDesktopHostTransport(): DesktopHostTransport;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:81

Reads the transport injected by preload.

## Returns

[`DesktopHostTransport`](../interfaces/DesktopHostTransport.md)

The transport exposed by preload

## Remarks

Only a complete bridge is accepted: a half-finished one that only exposes `request` is harder to diagnose than no bridge at all — better to stop it before connecting than to let an object with a missing method blow up at the first change push.

## Throws

[RxDBAdapterDesktopError](../classes/RxDBAdapterDesktopError.md) throws `host_unavailable` when nothing is injected or the bridge is incomplete
