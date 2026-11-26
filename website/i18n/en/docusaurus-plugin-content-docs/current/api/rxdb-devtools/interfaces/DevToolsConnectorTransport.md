# DevToolsConnectorTransport

Defined in: [connector-transport.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-transport.ts#L30)

The minimal abstraction of the connector transport layer.

## Remarks

The three methods each correspond to one browser hardcoding in the connector:

- [send](#send) — outbound frames (the v1 handshake carries a private port along; v2 frames go through the bus/host channel).
- [subscribe](#subscribe) — inbound frames (the host does source/origin/identity filtering and hands back the raw frames).
- [createSessionPort](#createsessionport) — the session private port; portless hosts (Tauri) return `undefined`.

## Methods

### closeSessionPort() \{#closesessionport\}

```ts
closeSessionPort(): void;
```

Defined in: [connector-transport.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-transport.ts#L64)

Closes the session private port; idempotent.

#### Returns

`void`

---

### createSessionPort() \{#createsessionport\}

```ts
createSessionPort(onMessage): Transferable | undefined;
```

Defined in: [connector-transport.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-transport.ts#L61)

Creates the session private port and returns the end handed over with the handshake.

#### Parameters

| Parameter   | Type                  | Description                                                    |
| ----------- | --------------------- | -------------------------------------------------------------- |
| `onMessage` | (`message`) => `void` | The port inbound callback (raw frames, no protocol filtering). |

#### Returns

`Transferable` \| `undefined`

The peer end to hand over, or `undefined`.

#### Remarks

Portless hosts (Tauri) return `undefined`: their isolation is provided by the host's routing by window label, equivalent to the browser's MessageChannel. The caller decides based on this whether the handshake carries a `transfer`.

---

### send() \{#send\}

```ts
send(message, transfer?): void;
```

Defined in: [connector-transport.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-transport.ts#L37)

Sends a message to the panel.

#### Parameters

| Parameter   | Type                                                                                            | Description                                               |
| ----------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `message`   | [`DevToolsConnectorNegotiationMessage`](../type-aliases/DevToolsConnectorNegotiationMessage.md) | A v1 or v2 frame.                                         |
| `transfer?` | `Transferable`[]                                                                                | The handshake's private port (omitted by portless hosts). |

#### Returns

`void`

---

### subscribe() \{#subscribe\}

```ts
subscribe(callback): () => void;
```

Defined in: [connector-transport.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-transport.ts#L49)

Subscribes to panel messages.

#### Parameters

| Parameter  | Type                  | Description             |
| ---------- | --------------------- | ----------------------- |
| `callback` | (`message`) => `void` | The per-frame callback. |

#### Returns

The unsubscribe function.

() => `void`

#### Remarks

The callback receives raw frames **without v1/v2 splitting** (the host has already done identity/origin filtering). Protocol splitting is the connector's responsibility, not here — otherwise every host would have to duplicate the judgment of "which one is a v1 command and which one is a v2 frame".
