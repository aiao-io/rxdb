# RxDBSystemVersionKind

```ts
type RxDBSystemVersionKind = 'system schema' | 'change codec';
```

Defined in: [packages/rxdb/src/system/migration.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L136)

"Which number" to report to users on a version mismatch — the two that belong to **the core itself**.

## Remarks

The two numbers evolve independently, so they cannot be merged into one "incompatible version" message: the error a
user receives must let them answer directly, "should I upgrade the client or run a migration?". `system schema` has a
migration ladder and can be caught up when behind; `change codec` has none.

This once also had `'commit protocol' | 'commit graph schema'` branches, which were moved out together when epic-006
extracted the package: the core no longer knows the commit concept, and keeping them in a closed union would mean the
core enumerating version names on behalf of the plugin. The plugin's own numbers moved to
[RxDBCapabilityVersionKind](../interfaces/RxDBCapabilityVersionKind.md).
