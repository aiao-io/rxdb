# RestoreReplayDirection

```ts
type RestoreReplayDirection = "reverse";
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L90)

Replay direction.

## Remarks

v1 only allows restoring commits reachable from HEAD along the parent chain (FR-033), so it is always `'reverse'` — restoring an ancestor =
applying `inversePatch` one by one backwards from HEAD. It is still a **field** in the diagnostics rather than a hard-coded sentence:
whoever receives a [RestoreIncompatibility](../interfaces/RestoreIncompatibility.md) (logs, reporting, users) knows from it to look at that commit's
`inversePatch` rather than `patch`, without needing to know the background that "v1 can only walk backwards".
