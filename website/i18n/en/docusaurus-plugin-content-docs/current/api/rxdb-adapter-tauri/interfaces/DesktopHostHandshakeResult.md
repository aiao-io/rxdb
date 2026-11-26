# DesktopHostHandshakeResult

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:160

Response to the `handshake` request.

## Properties

### protocolVersion \{#protocolversion\}

```ts
readonly protocolVersion: number;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:162

Wire protocol version spoken by the host; the renderer decides from it whether to proceed with `open`.
