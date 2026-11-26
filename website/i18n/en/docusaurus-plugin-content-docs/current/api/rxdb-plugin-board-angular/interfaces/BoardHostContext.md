# BoardHostContext

Defined in: packages/rxdb-plugin-board/dist/host-context.d.ts:10

Board host context ("restoring" in the US-534 tech note is the shared write gate).

## Remarks

The host injects the current board and "whether a restore is in progress"; the state is injected by the host rather than held by the service,
so service-layer cases can be accepted without depending on the UI (US-534 AC#10). The single-user edition has no read-only host;
read-only, login, and membership are folded into the same check by US-541.

## Properties

### boardId \{#boardid\}

```ts
readonly boardId: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: packages/rxdb-plugin-board/dist/host-context.d.ts:12

Current board id; `null` when no board is selected yet (startup selection phase).

---

### restoring \{#restoring\}

```ts
readonly restoring: boolean;
```

Defined in: packages/rxdb-plugin-board/dist/host-context.d.ts:14

Entered as soon as any page starts a restore; writable again once the restore failure is cleared.
