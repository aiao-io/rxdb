# TrustedWriteScope

```ts
type TrustedWriteScope = object;
```

Defined in: [packages/rxdb/src/trusted-write/trusted-write-scope.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/trusted-write-scope.ts#L69)

The scope object: an adapter instance or a transaction executor.

## Remarks

Deliberately widened to `object`: the core package should not import adapter types just for a WeakMap key, which
would turn the `rxdb-adapter.ts → working-tree → rxdb-adapter.ts` cycle from one that "disappears after type erasure"
into a real cycle.
