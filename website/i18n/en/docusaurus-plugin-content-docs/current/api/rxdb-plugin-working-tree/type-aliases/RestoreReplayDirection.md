# RestoreReplayDirection

```ts
type RestoreReplayDirection = 'reverse';
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L90)

The replay direction.

## Remarks

v1 only allows restoring commits reachable from HEAD along the parent chain (FR-033), so it is always
`'reverse'` — restoring an ancestor = walking back from HEAD applying `inversePatch` one by one. It is still
a **field** in the diagnosis rather than a hard-coded sentence: whoever receives a
[RestoreIncompatibility](../interfaces/RestoreIncompatibility.md) (logs, reporting, users) can tell from it
that they should look at that commit's `inversePatch` rather than its `patch`, without first knowing the
background fact that "v1 can only walk backwards".
