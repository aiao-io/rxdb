# HandshakeMessage

Defined in: [types.ts:115](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L115)

The handshake message.

## Remarks

This is the **only** message that must go through `window.postMessage`, because no channel exists yet at this point. It carries a `MessagePort` (item 0 of the `transfer` array): the connector keeps `port1` and hands out `port2`; after the handshake, all bidirectional events, commands and responses go through this port and no longer appear on the `window` bus.

What the port buys is "not being eavesdropped after the handshake" — cross-origin iframes and scripts injected later see nothing. It does not buy "identity authentication at handshake time": any `message` listener in the same realm can read the same `event.ports`. That layer is covered by [DevToolsCapability](../type-aliases/DevToolsCapability.md).

The `null` payload is the compatibility form within the deprecation window (produced by old connectors); new connectors always send [HandshakePayload](HandshakePayload.md).

## Extends

- [`DevToolsMessage`](DevToolsMessage.md)&lt;[`HandshakePayload`](HandshakePayload.md) \| `null`&gt;

## Properties

### direction \{#direction\}

```ts
direction: 'page-to-devtools';
```

Defined in: [types.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L117)

#### Overrides

[`DevToolsMessage`](DevToolsMessage.md).[`direction`](DevToolsMessage.md#direction)

---

### payload \{#payload\}

```ts
payload: HandshakePayload | null;
```

Defined in: [types.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L93)

#### Inherited from

[`DevToolsMessage`](DevToolsMessage.md).[`payload`](DevToolsMessage.md#payload)

---

### sequence \{#sequence\}

```ts
sequence: number;
```

Defined in: [types.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L95)

#### Inherited from

[`DevToolsMessage`](DevToolsMessage.md).[`sequence`](DevToolsMessage.md#sequence)

---

### source \{#source\}

```ts
source: '@aiao/rxdb-devtools';
```

Defined in: [types.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L90)

#### Inherited from

[`DevToolsMessage`](DevToolsMessage.md).[`source`](DevToolsMessage.md#source)

---

### tabId? \{#tabid\}

```ts
tabId?: number;
```

Defined in: [types.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L96)

#### Inherited from

[`DevToolsMessage`](DevToolsMessage.md).[`tabId`](DevToolsMessage.md#tabid)

---

### timestamp \{#timestamp\}

```ts
timestamp: number;
```

Defined in: [types.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L94)

#### Inherited from

[`DevToolsMessage`](DevToolsMessage.md).[`timestamp`](DevToolsMessage.md#timestamp)

---

### type \{#type\}

```ts
type: 'HANDSHAKE';
```

Defined in: [types.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L116)

#### Overrides

[`DevToolsMessage`](DevToolsMessage.md).[`type`](DevToolsMessage.md#type)
