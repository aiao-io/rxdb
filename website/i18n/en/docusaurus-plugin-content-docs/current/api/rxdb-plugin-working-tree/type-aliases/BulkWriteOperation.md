# BulkWriteOperation

```ts
type BulkWriteOperation = InterceptedBulkWrite;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts#L32)

The two adapter bulk write methods subject to the gate.

## Remarks

**An alias of the core's [InterceptedBulkWrite](../../rxdb/type-aliases/InterceptedBulkWrite.md), not a second declaration.** This set changes with the **core's write primitives**
(one more bulk write method means one more mount point), and by the line drawn in `capture/index.ts` it belongs to the core; the plugin side just uses
the same set under a local name.

With each side writing its own copy, the core adding a third operation would produce **no compile error at all** — the plugin's copy still has only two entries, so the gate
would treat the new method uniformly as "unrecognized", and the opening appears silently. After changing to an alias, the exhaustiveness checks of the three `Record<…>` lookup tables below in this file
turn red on the spot, and an omission cannot pass.
