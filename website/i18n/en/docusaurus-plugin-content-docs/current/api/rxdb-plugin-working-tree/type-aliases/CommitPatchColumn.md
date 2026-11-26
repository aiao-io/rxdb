# CommitPatchColumn

```ts
type CommitPatchColumn = 'patch' | 'inversePatch';
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L106)

The two columns that carry change content; both are equally authoritative: reverse data leakage and forward data leakage are the same thing.
