# HandshakePayload

Defined in: [types.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L81)

The handshake payload: protocol version + the capability tier granted by this page.

## Remarks

Old connectors send `payload: null` or the v1 form, and [isDevToolsMessage](../functions/isDevToolsMessage.md) still accepts it so the peer can recognize the version mismatch and give a diagnostic. When the DevTools side cannot read capabilities, it interprets them as `'full'` (historical behavior).

## Properties

### capabilities \{#capabilities\}

```ts
capabilities: DevToolsCapability;
```

Defined in: [types.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L85)

The capability tier this page grants to DevTools.

***

### protocolVersion \{#protocolversion\}

```ts
protocolVersion: 2;
```

Defined in: [types.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/types.ts#L83)

The protocol version implemented by the page side.
