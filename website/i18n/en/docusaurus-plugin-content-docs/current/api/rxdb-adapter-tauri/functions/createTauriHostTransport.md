# createTauriHostTransport()

```ts
function createTauriHostTransport(options): DesktopHostTransport;
```

Defined in: [packages/rxdb-adapter-tauri/src/tauri-host-transport.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/tauri-host-transport.ts#L111)

Assembles a desktop host transport from Tauri's `invoke` / `listen`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`TauriHostTransportOptions`](../interfaces/TauriHostTransportOptions.md) | The injected Tauri APIs and error callback |

## Returns

[`DesktopHostTransport`](../interfaces/DesktopHostTransport.md)

A transport that can be handed directly to `RxDBAdapterTauri` or `DesktopSqliteClient.connect`

## Remarks

Event subscription is **lazy and shared**: `listen` is only called once, when the first subscriber
arrives; all later subscribers reuse the same channel, and it is torn down when the last one
unsubscribes. Multiple `DesktopSqliteClient`s share one transport; each message carries a `sessionId`
and each client matches its own.

`listen` is asynchronous, while `DesktopHostTransport.subscribe` must return the unsubscribe
function synchronously. The bridge first puts the callback into a local set, then registers: an
unsubscribe arriving before the registration settles is not missed, because the set is re-checked
for emptiness when the registration settles.
