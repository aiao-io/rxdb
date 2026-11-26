# FtsField

Defined in: [packages/rxdb-adapter-pglite/src/fts/types.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/fts/types.ts#L27)

## Properties

### arrayKind? \{#arraykind\}

```ts
readonly arrayKind?: FtsArrayKind;
```

Defined in: [packages/rxdb-adapter-pglite/src/fts/types.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/fts/types.ts#L43)

Physical form of the array column; only meaningful when `isArray === true`.

Defaults to [DEFAULT\_FTS\_ARRAY\_KIND](../variables/DEFAULT_FTS_ARRAY_KIND.md) (`'text[]'`) — consistent with the adapter's table mapping for `PropertyType.stringArray`. Previously `jsonb_array_elements_text(NEW.<col>)` was generated unconditionally as JSONB, which is 42883 on tables **created by the adapter itself** (PGL-007).

---

### isArray \{#isarray\}

```ts
readonly isArray: boolean;
```

Defined in: [packages/rxdb-adapter-pglite/src/fts/types.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/fts/types.ts#L35)

Whether it is a `StringArrayProperty`:

- `true` → array column, the trigger expands it into space-separated text according to [FtsField.arrayKind](#arraykind)
- `false` → plain `TEXT` column, the trigger reads `NEW.<field>` directly

---

### name \{#name\}

```ts
readonly name: string;
```

Defined in: [packages/rxdb-adapter-pglite/src/fts/types.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/fts/types.ts#L29)

Field column name (must match the original table's column name)
