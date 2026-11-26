# DESKTOP_HOST_PROTOCOL_VERSION

```ts
const DESKTOP_HOST_PROTOCOL_VERSION: 2 = 2;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:24

Wire protocol version.

## Remarks

The renderer checks this value in the `handshake` response (the `open` response carries another copy, see [DesktopHostOpenResult.protocolVersion](../interfaces/DesktopHostOpenResult.md#protocolversion)). It is identical whenever the TS host and the renderer come from the same build; a mismatch can only happen when different versions of the runtime packages are mixed (`@aiao/rxdb-adapter-electron` / `@aiao/rxdb-adapter-tauri`, or their respective dependencies on this package out of sync) — in that situation, continuing would produce shape errors that are hard to locate, so the connection is refused outright.

The Tauri host is an exception: it lives in Rust, so the version number has to be copied by hand a second time (`PROTOCOL_VERSION` in `packages/rxdb-adapter-tauri/rust/src/protocol.rs`). The only mechanical link between the two constants is the conformance suite's `conformance/protocol-handshake.spec.ts`, which compares the number a real process reports against this constant; changing this value turns that case red.

v2 (US-217) added [DesktopHostMuteRequest](../interfaces/DesktopHostMuteRequest.md) and relaxed [DESKTOP\_HOST\_MAX\_SQL\_LENGTH](DESKTOP_HOST_MAX_SQL_LENGTH.md) to 64 Mi. Unlike when the handshake was added, the version had to be bumped this time: a v1 host would refuse an over-long statement or an unknown `mute` only mid-restore, by which time the target database has already been written; after the bump it is rejected at the handshake step, with the target untouched by a single byte (US-217 AC#21).
