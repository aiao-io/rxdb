# SearchBackendCapabilities

Defined in: [packages/rxdb-plugin-search/src/backend/search-backend.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/search-backend.ts#L38)

The capability set **self-declared** by a backend.

Whether an adapter can be used is decided here, not by its name: the registry maps adapter names to backends, the backend declares capabilities, and real availability is verified once more against a live connection at load time by [SearchBackend.assertCapabilities](SearchBackend.md#assertcapabilities). All three layers must pass before it is allowed.

## Properties

### arrayFields \{#arrayfields\}

```ts
readonly arrayFields: boolean;
```

Defined in: [packages/rxdb-plugin-search/src/backend/search-backend.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/search-backend.ts#L46)

Can expand array columns into indexable text

---

### containsFallback \{#containsfallback\}

```ts
readonly containsFallback: boolean;
```

Defined in: [packages/rxdb-plugin-search/src/backend/search-backend.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/search-backend.ts#L44)

Supports an unindexed infix fallback scan when the whole table has zero hits

---

### fullTextIndex \{#fulltextindex\}

```ts
readonly fullTextIndex: boolean;
```

Defined in: [packages/rxdb-plugin-search/src/backend/search-backend.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/search-backend.ts#L40)

Has full-text matching that can be accelerated by an index (FTS5 virtual tables / GIN + tsvector)

---

### snippet \{#snippet\}

```ts
readonly snippet: boolean;
```

Defined in: [packages/rxdb-plugin-search/src/backend/search-backend.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/search-backend.ts#L42)

Can produce highlight snippets directly from the storage layer (`snippet()` / `ts_headline()`)
