# HandshakeAckMessage

Defined in: [types.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L121)

The handshake acknowledgment message.

## Extends

- [`DevToolsMessage`](DevToolsMessage.md)&lt;`null`&gt;

## Properties

### direction \{#direction\}

```ts
direction: 'devtools-to-page';
```

Defined in: [types.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L123)

#### Overrides

[`DevToolsMessage`](DevToolsMessage.md).[`direction`](DevToolsMessage.md#direction)

---

### payload \{#payload\}

```ts
payload: null;
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
type: 'HANDSHAKE_ACK';
```

Defined in: [types.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L122)

#### Overrides

[`DevToolsMessage`](DevToolsMessage.md).[`type`](DevToolsMessage.md#type)
