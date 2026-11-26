# DevToolsSnapshotSide

```ts
type DevToolsSnapshotSide = 'meta' | 'file';
```

Defined in: [provider/types.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L31)

Whether a snapshot record comes from metadata or the file body.

## Remarks

The "two kinds of missing" judgment (metadata without a file / file without metadata) rests entirely on this field:
a `logicalPath` appearing only as `meta` or only as `file` is one kind of missing.
