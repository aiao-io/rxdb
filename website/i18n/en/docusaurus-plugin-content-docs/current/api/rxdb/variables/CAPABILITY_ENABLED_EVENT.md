# CAPABILITY_ENABLED_EVENT

```ts
const CAPABILITY_ENABLED_EVENT: "CAPABILITY_ENABLED";
```

Defined in: [packages/rxdb/src/rxdb-events.ts:162](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L162)

A capability was just enabled on **another connection** (FR-037).

## Remarks

Capability bits are one-way latches: they can only be enabled, never disabled. So this event has only one direction too — the side that receives it switches the capability on for this connection; there is no symmetric "disable on receipt".

The payload carries only the capability name — no adapter, no executor, no handle of any kind: only the local connection knows what it takes to switch it on, and the copy sent across connections points at **someone else's** epoch.

It is not part of [RxDBEntityEventMap](../interfaces/RxDBEntityEventMap.md): it carries no `entities`, so [isCrossTabEvent](../functions/isCrossTabEvent.md) is always `false` for it. If it were ever piggybacked on the gateway's entity forwarding path it would echo endlessly between the two sides (each echo gets a new `messageId`, which the deduplication window cannot stop). Its cross-connection delivery is done explicitly and one-directionally by RxDBTabsGateway.broadcastCapabilityEnabled.
