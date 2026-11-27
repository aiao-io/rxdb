# DesktopHostHandshakeRequest

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:99

Negotiates the wire protocol version.

## Remarks

**Takes no parameters and produces no side effects** — that is exactly why it exists. Version checking must come before
`open`: `open` creates the database, opens a connection, and registers the session; by the time the renderer reads a
version mismatch out of the `open` response, an empty database file has already appeared on disk, and the caller has
no client — hence no handle — to clean it up (US-207 AC#9 / US-210 AC#10).

A host old enough not to know this kind responds `protocol_violation` — that path likewise never touches the filesystem,
so "no database is created on a version mismatch" holds on both old and new hosts, not just on new ones.
For the same reason, adding this request did **not** raise [DESKTOP\_HOST\_PROTOCOL\_VERSION](../variables/DESKTOP_HOST_PROTOCOL_VERSION.md):
it is purely additive to the host — an old renderer sending `open` directly behaves character-for-character the same on a new host.

## Properties

### kind \{#kind\}

```ts
readonly kind: "handshake";
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:100
