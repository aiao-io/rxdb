# BulkWriteOperation

```ts
type BulkWriteOperation = InterceptedBulkWrite;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts#L32)

The two public batch write methods of the adapter that are subject to the gate.

## Remarks

**An alias of the core's [InterceptedBulkWrite](../../rxdb/type-aliases/InterceptedBulkWrite.md), not a second
declaration.** This set changes with the **core's write primitives** (one more batch write method means one
more mount point), and by the line drawn in `capture/index.ts` it belongs to the core; the plugin side just
gives the same set a local name.

With the two written out separately, the core adding a third operation would produce **no compile error** —
the plugin's copy would still have only two entries, the gate would treat the new method as "unrecognized",
and an opening would silently appear. Changed to an alias, the exhaustiveness checks on the three `Record<…>`
lookup tables below in this file turn red on the spot, so a missed update cannot pass.
