# BoardHostContext

Defined in: packages/rxdb-plugin-board/dist/host-context.d.ts:10

Board host context (per US-534 technical note, "restoring" is the shared write gate).

## Remarks

The host injects the current board and whether a restore is in progress; the state is host-injected rather than service-owned so service-layer use cases can be verified without the UI (US-534 AC#10). The single-user version has no read-only host; read-only, sign-in and membership join the same check in US-541.

## Properties

### boardId \{#boardid\}

```ts
readonly boardId: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: packages/rxdb-plugin-board/dist/host-context.d.ts:12

Current board id; `null` before a board is selected (startup selection phase).

---

### restoring \{#restoring\}

```ts
readonly restoring: boolean;
```

Defined in: packages/rxdb-plugin-board/dist/host-context.d.ts:14

Entered as soon as any page starts a restore; writability returns after a failed restore is cleared.
