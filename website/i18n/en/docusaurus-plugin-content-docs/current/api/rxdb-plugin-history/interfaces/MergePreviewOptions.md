# MergePreviewOptions

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:126](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L126)

Options of `VersionManager.previewMerge()`.

## Properties

### strategy? \{#strategy\}

```ts
readonly strategy?: MergeStrategy;
```

Defined in: [packages/rxdb-plugin-history/src/branch-compare.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/branch-compare.ts#L132)

Which strategy to preview with; change-by-change merging keeps the source branch's ghost operations that would delete entities still present on the target

#### Default Value

`'squash'`
