# CommitPatchColumn

```ts
type CommitPatchColumn = 'patch' | 'inversePatch';
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/commit-codec.ts#L106)

The two columns that carry change content, both equal: leaking data in reverse and leaking data forward are
the same thing.
