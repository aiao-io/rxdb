# DESKTOP_HOST_PROTOCOL_VERSION

```ts
const DESKTOP_HOST_PROTOCOL_VERSION: 2 = 2;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:24

Wire protocol version.

## Remarks

The renderer checks this value in the `handshake` response (the `open` response also carries a copy;
see [DesktopHostOpenResult.protocolVersion](../interfaces/DesktopHostOpenResult.md#protocolversion)). When the TS host and the renderer come from
the same build it is identical; inequality can only happen with mixed versions of the runtime
packages (`@aiao/rxdb-adapter-electron` / `@aiao/rxdb-adapter-tauri`, or their respective copies of
this package out of sync) — continuing in that case produces hard-to-locate shape errors, so the
connection is refused outright.

The Tauri host is an exception: it lives in Rust, so the version number can only be copied a second
time (`PROTOCOL_VERSION` in `packages/rxdb-adapter-tauri/rust/src/protocol.rs`). The only mechanical
link between the two constants is the conformance suite's `conformance/protocol-handshake.spec.ts`,
which compares the number reported by a real process against this constant; changing this value turns
that test red.

v2 (US-217) added [DesktopHostMuteRequest](../interfaces/DesktopHostMuteRequest.md) and relaxed [DESKTOP\_HOST\_MAX\_SQL\_LENGTH](DESKTOP_HOST_MAX_SQL_LENGTH.md) to 64 Mi.
Unlike when the handshake was first added, the version had to be bumped this time: a v1 host only
rejects an overlong statement or an unknown `mute` mid-restore, by which point the target database
has already been written; with the bump it is rejected at the handshake step, before a single byte of
the target moves (US-217 AC#21).
