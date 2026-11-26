# TauriHostTransportOptions

Defined in: [packages/rxdb-adapter-tauri/src/tauri-host-transport.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/tauri-host-transport.ts#L45)

Dependency injection point of [createTauriHostTransport](../functions/createTauriHostTransport.md).

## Properties

### invoke \{#invoke\}

```ts
readonly invoke: (command, args) => Promise<unknown>;
```

Defined in: [packages/rxdb-adapter-tauri/src/tauri-host-transport.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/tauri-host-transport.ts#L53)

Tauri's command invocation function, usually `invoke` from `@tauri-apps/api/core`.

#### Parameters

| Parameter | Type                                | Description       |
| --------- | ----------------------------------- | ----------------- |
| `command` | `string`                            | Command name      |
| `args`    | `Record`&lt;`string`, `unknown`&gt; | Command arguments |

#### Returns

`Promise`&lt;`unknown`&gt;

Command return value (JSON shape)

---

### listen \{#listen\}

```ts
readonly listen: (event, handler, options?) => Promise<() => void>;
```

Defined in: [packages/rxdb-adapter-tauri/src/tauri-host-transport.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/tauri-host-transport.ts#L62)

Tauri's event subscription function, usually `listen` from `@tauri-apps/api/event`.

#### Parameters

| Parameter         | Type                       | Description                                                                                              |
| ----------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `event`           | `string`                   | Event name                                                                                               |
| `handler`         | (`event`) => `void`        | Event callback                                                                                           |
| `options?`        | \{ `target?`: `string`; \} | Subscription options; this transport only uses `target`, see [TauriHostTransportOptions.target](#target) |
| `options.target?` | `string`                   | -                                                                                                        |

#### Returns

`Promise`&lt;() => `void`&gt;

Function to unsubscribe

---

### onListenError? \{#onlistenerror\}

```ts
readonly onListenError?: (error) => void;
```

Defined in: [packages/rxdb-adapter-tauri/src/tauri-host-transport.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/tauri-host-transport.ts#L93)

Callback for problems on the change-event channel, covering both registration failure and delivery failure.

#### Parameters

| Parameter | Type      | Description                                                                                         |
| --------- | --------- | --------------------------------------------------------------------------------------------------- |
| `error`   | `unknown` | The reason `listen` registration failed, or the reason a pushed message failed to decode / dispatch |

#### Returns

`void`

#### Remarks

When omitted, errors are thrown into the global error handler. They must **not be swallowed
silently**: a broken change-event channel means reactive queries never refresh, appearing in the UI
as "the data did not change" — the hardest of all failure shapes to diagnose.

Implementations **should not throw**: this is called synchronously from Tauri's event callback, and
a throw has no one to catch it.

---

### target \{#target\}

```ts
readonly target: string;
```

Defined in: [packages/rxdb-adapter-tauri/src/tauri-host-transport.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-tauri/src/tauri-host-transport.ts#L81)

Label of the window this WebView lives in, usually `getCurrentWebviewWindow().label`.

#### Remarks

**This is the other half of targeted delivery, not an optional tuning knob.** The Rust side uses
`emit_to(owner)` to send change events only to the window that opened the session, but tauri's
`match_any_or_filter` **unconditionally matches** any `emit_to` when a listener's target is `Any` —
and `@tauri-apps/api`'s `listen()` defaults to exactly `{ kind: 'Any' }`. Registering without a
target means any webview that can call `listen` (it only needs `core:event:allow-listen`) receives
every window's sessionIds, database names, table names, and rowIds.

Deliberately **required** rather than falling back to a global subscription when omitted: that
default is "unconfigured means allow everything", exactly the fallback shape this repository does
not accept. Callers injecting `getCurrentWebviewWindow().listen` already carry
`{ kind: 'Webview', label }`; that `listen` ignores this field, and filling it in is harmless.
