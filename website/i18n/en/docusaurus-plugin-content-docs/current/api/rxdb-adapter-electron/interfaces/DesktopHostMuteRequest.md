# DesktopHostMuteRequest

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:140

Pauses / resumes change event collection for a session (protocol v2).

## Remarks

Muted while restoring an entire database: the system table rows a restore writes in are not new changes
and must not be dispatched as events. Muting must land on the host side: if the renderer merely discarded them,
the host would still accumulate rowIds for every row and move the whole batch across IPC — a cost that grows
linearly with database size and cannot fit under US-217 AC#9's memory budget. While muted, the host neither
batches nor dispatches, same semantics as the wasm client's method of the same name.

## Properties

### kind \{#kind\}

```ts
readonly kind: "mute";
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:141

---

### muted \{#muted\}

```ts
readonly muted: boolean;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:143

---

### sessionId \{#sessionid\}

```ts
readonly sessionId: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-host-protocol.d.ts:142
