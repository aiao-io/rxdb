# DevToolsSnapshotRecord

```ts
type DevToolsSnapshotRecord = readonly [side: DevToolsSnapshotSide, logicalPath: string, id: string | null, size: number | null, contentVersion: string | null];
```

Defined in: [provider/types.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L41)

Canonical snapshot record: `[side, logicalPath, id, size, contentVersion]`.

## Remarks

Defined as a **tuple** rather than an object so byte accounting is unaffected by key order — different implementations may
`JSON.stringify` object keys in different orders, in which case "32 MiB" would be a different quantity on each side.
Missing scalars are always written as `null`; fields must not be omitted: omission shortens the tuple and likewise breaks the consistency of the accounting.
