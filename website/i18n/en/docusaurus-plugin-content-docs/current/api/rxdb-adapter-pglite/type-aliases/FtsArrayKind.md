# FtsArrayKind

```ts
type FtsArrayKind = "text[]" | "jsonb";
```

Defined in: [packages/rxdb-adapter-pglite/src/fts/types.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/fts/types.ts#L18)

The **physical** storage shape of an array column.

The adapter generates native `text[]` for `PropertyType.stringArray`
(see `rxDBColumnTypeToPGliteType`), so the default is `'text[]'`.
Only when the caller created the column as JSONB itself is explicit `'jsonb'` needed (PGL-007).
