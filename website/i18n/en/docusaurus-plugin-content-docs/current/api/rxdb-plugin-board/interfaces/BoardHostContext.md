# BoardHostContext

Defined in: [packages/rxdb-plugin-board/src/host-context.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/host-context.ts#L13)

Board host context (the "restoring" flag from the US-534 technical note is the shared write gate).

## Remarks

The host injects the current board and whether a restore is in progress; the state is injected by the host rather than held by the service itself, so service-layer use cases can be accepted without depending on the UI (US-534 AC#10). The single-user version has no read-only host; read-only, login, and membership are folded into the same determination by US-541.

## Properties

### boardId \{#boardid\}

```ts
readonly boardId: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: [packages/rxdb-plugin-board/src/host-context.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/host-context.ts#L15)

The current board id; `null` when no board has been selected yet (during the startup selection phase).

---

### restoring \{#restoring\}

```ts
readonly restoring: boolean;
```

Defined in: [packages/rxdb-plugin-board/src/host-context.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/host-context.ts#L17)

Set when any page starts a restore; once a failed restore is cleared, writes become available again.
