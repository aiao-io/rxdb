# OpfsFallback

```ts
type OpfsFallback = "memory" | "throw";
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L55)

Behavior when the OPFS backend database cannot be opened (for example the browser lacks `Atomics.wait`,
or `crossOriginIsolated`, etc.).

- `'memory'`: print a warning and explicitly fall back to `:memory:`.
- `'throw'` (default): rethrow the original error; the caller is responsible for handling it.
