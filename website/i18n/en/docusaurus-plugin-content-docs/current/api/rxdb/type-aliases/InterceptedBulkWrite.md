# InterceptedBulkWrite

```ts
type InterceptedBulkWrite = 'upsert_many' | 'delete_by_ids';
```

Defined in: [packages/rxdb/src/capture/capture-interceptor.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/capture/capture-interceptor.ts#L43)

The bulk-write methods that get intercepted.

## Remarks

This set changes together with the core's write primitives, so it belongs to the core — the
`BulkWriteOperation` of `@aiao/rxdb-plugin-working-tree` is an **alias** of this type, not a second parallel
declaration. When a fourth bulk-write primitive is added, changing this one place turns the plugin-side lookup table
keyed by operation red as well, thanks to the exhaustiveness check.
