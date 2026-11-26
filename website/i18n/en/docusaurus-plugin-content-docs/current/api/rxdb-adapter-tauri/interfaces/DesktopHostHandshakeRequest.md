# DesktopHostHandshakeRequest

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:99

Negotiates the wire protocol version.

## Remarks

**Carries no parameters and produces no side effects** — that is exactly why it exists. The version
check must happen before `open`: `open` creates the database, opens the connection, and registers
the session; by the time the renderer reads a version mismatch out of the `open` response, an empty
database file already exists on disk, and the caller has no client, hence no handle, to clean it up
with (US-207 AC#9 / US-210 AC#10).

A host too old to know this kind responds `protocol_violation` — that path likewise never touches
the filesystem, so "no database is created on a version mismatch" holds for old and new hosts alike,
not just new ones. For the same reason, adding this request did **not** bump
[DESKTOP\_HOST\_PROTOCOL\_VERSION](../variables/DESKTOP_HOST_PROTOCOL_VERSION.md): it is purely additive for the host, and an old
renderer sending `open` directly behaves byte-for-byte the same on a new host.

## Properties

### kind \{#kind\}

```ts
readonly kind: "handshake";
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:100
