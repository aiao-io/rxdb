# DesktopHostTransport

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:16

Transport layer between the renderer and the host.

## Remarks

Deliberately kept extremely narrow: under Electron the preload exposes these two methods through
`contextBridge`, so the renderer never gets the raw `ipcRenderer` and cannot send messages to
arbitrary channels. Swapping in a `MessagePort` or `worker_threads` only requires satisfying the
same two methods; the client needs no changes.

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
| `payload` | \| [`DesktopHostRequest`](../type-aliases/DesktopHostRequest.md) \| [`DesktopHostFileRequest`](../type-aliases/DesktopHostFileRequest.md) \| `DesktopPgliteRequest` | Protocol request |

#### Returns

`Promise`&lt;`unknown`&gt;

The host's unvalidated response payload

#### Remarks

The SQLite, file, and PGlite request families share one channel: the method name exposed by the
preload is frozen by the e2e `bridgeKeys` assertion, and opening another one means adding a method.
Dispatch is done by the host-side router on `kind`.

---

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:34

Subscribes to messages the host pushes proactively.

#### Parameters

| Parameter  | Type                  | Description      |
| ---------- | --------------------- | ---------------- |
| `listener` | (`message`) => `void` | Message callback |

#### Returns

Function to unsubscribe

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

Fulfills when the channel is ready; rejects with the original reason when registration fails

#### Remarks

`subscribe()` must return the unsubscribe function **synchronously**, so it cannot hand out the
"channel is up" moment. And Tauri's `listen` is asynchronous: change events the host `emit`s before
the registration settles reach no one. The caller starts writing to the database as soon as
`connect()` returns, and what gets lost is exactly the first batch of changes after database
creation — visible as "the first screen never refreshes". So readiness must be awaitable instead of
being gambled on with a delay.

Omission means **the subscription is effective when `subscribe()` returns**: Electron's
`ipcRenderer.on` is synchronous with no awaitable intermediate state, so it is left empty as-is here
(the preload's bridge key set is frozen by the e2e `bridgeKeys` assertion, so it cannot be added
either). A transport that builds its channel asynchronously **must** implement it.
