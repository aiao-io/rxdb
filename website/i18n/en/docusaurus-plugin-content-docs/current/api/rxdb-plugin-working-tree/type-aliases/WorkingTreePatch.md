# WorkingTreePatch

```ts
type WorkingTreePatch = Readonly<Record<string, unknown>> | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L24)

Field-level patch; `null` means "no value on this side" (the inverse of insert, the forward of delete).
