# DesktopHostTransport

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:16

Transport layer between the renderer and the host.

## Remarks

Deliberately kept extremely narrow: under Electron the preload exposes these two methods via `contextBridge`,
so the renderer does not get the raw `ipcRenderer` and cannot send messages on arbitrary channels.
Swapping in `MessagePort` or `worker_threads` only requires satisfying the same two methods; the client needs no changes.

## Methods

### request() \{#request\}

```ts
request(payload): Promise<unknown>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:27

Sends a request and waits for the response.

#### Parameters

| Parameter | Type                                                                                                                                                                | Description      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `payload` | \| [`DesktopHostFileRequest`](../type-aliases/DesktopHostFileRequest.md) \| [`DesktopHostRequest`](../type-aliases/DesktopHostRequest.md) \| `DesktopPgliteRequest` | Protocol request |

#### Returns

`Promise`&lt;`unknown`&gt;

The host's unvalidated response payload

#### Remarks

SQLite, file, and PGlite requests share the same channel: the method name the preload exposes is frozen by the e2e
`bridgeKeys` assertion, and opening another channel is equivalent to adding a method. Dispatch is done by the host-side router by `kind`.

---

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:34

Subscribes to messages the host pushes on its own initiative.

#### Parameters

| Parameter  | Type                  | Description      |
| ---------- | --------------------- | ---------------- |
| `listener` | (`message`) => `void` | Message callback |

#### Returns

The unsubscribe function

() => `void`

---

### subscriptionReady()? \{#subscriptionready\}

```ts
subscriptionReady?(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:51

Whether the channel registration triggered by the last [DesktopHostTransport.subscribe](#subscribe) has taken effect.

#### Returns

`Promise`&lt;`void`&gt;

Resolves when the channel is ready; rejects with the original reason when registration fails

#### Remarks

`subscribe()` must return the unsubscribe function **synchronously**, so it cannot hand over the moment
"the channel is established". Tauri's `listen`, however, is asynchronous: change events the host `emit`s before
registration settles reach nobody. The caller starts writing to the database as soon as `connect()` returns,
and exactly the first batch of changes after database creation is what gets lost — showing up as
"the first screen does not refresh". Readiness must therefore be awaitable, not gambled on with delays.

Omitting it means **the subscription is in effect as soon as `subscribe()` returns**: Electron's
`ipcRenderer.on` is synchronous and has no awaitable intermediate state, so it is honestly left empty here
(the preload's bridge key set is frozen by the e2e `bridgeKeys` assertion and cannot grow one either).
A transport that establishes its channel asynchronously **must** implement it.
