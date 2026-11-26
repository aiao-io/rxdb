# NoCaptureReason

```ts
type NoCaptureReason =
  'untracked_target' | 'no_net_change' | 'domain_managed' | 'system_target' | 'capability_disabled';
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/write-entry-matrix.ts#L112)

The reasons for allowing a write through without producing a unit; each corresponds to a different group of
rows in the matrix.
