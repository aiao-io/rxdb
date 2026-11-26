# TrustedWritePrimitive

```ts
type TrustedWritePrimitive = 
  | "adapter.switchBranch"
  | "adapter.mergeChanges"
  | "executor.mergeChanges"
  | "adapter.transaction";
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-intent.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-intent.ts#L93)

The write primitive actually invoked by a trusted call site

## Remarks

The `adapter.` and `executor.` prefixes are not noise: the same `mergeChanges` arrives through two hosts; the mount point is only mounted on the
adapter, so the rows going through the executor must be registered separately to avoid showing up in drift scans as "unregistered bulk rewrites".

`adapter.transaction` differs from the other three: an undeclared `transaction()` is ordinary CRUD, not an unknown entrance,
so it only enters the registry when it has **self-reported an intent**. The declaration hangs on the executor handed out by this transaction, and mount point 1
is only taken after the transaction body returns — the declaration must therefore be written at the **end** of the transaction body,
writing it at the beginning would let the nested trusted primitives inside the body take it first.
No row uses it today (the former #10 moved to `switchBranch` on 2026-09-26), but it stays in the union: mount point 1's take
semantics remain, and the drift scan's vocabulary is parsed from this union.
