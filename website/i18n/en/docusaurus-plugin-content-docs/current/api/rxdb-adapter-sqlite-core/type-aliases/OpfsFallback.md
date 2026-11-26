# OpfsFallback

```ts
type OpfsFallback = "memory" | "throw";
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L55)

Behavior when the OPFS backend database cannot be opened (e.g. the browser does not support `Atomics.wait`,
lacks `crossOriginIsolated`, etc.).

- `'memory'`: prints a warning and explicitly falls back to `:memory:`.
- `'throw'` (default): rethrows the original error; the caller is responsible for handling it.
