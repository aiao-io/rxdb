# DesktopHostHandshakeResult

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:160

Response to a `handshake` request.

## Properties

### protocolVersion \{#protocolversion\}

```ts
readonly protocolVersion: number;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:162

The wire protocol version the host speaks; the renderer decides from it whether to proceed with sending `open`.
