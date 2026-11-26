# SearchEngineQuery

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L39)

Input to `createSearchEngine().search(...)`.

## Properties

### compiled \{#compiled\}

```ts
readonly compiled: CompiledQuery | null;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L61)

Compiled query; `null` returns an empty array directly

---

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L53)

Business entity name (for display)

---

### fields \{#fields\}

```ts
readonly fields: readonly string[];
```

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L57)

List of fields participating in the search; order = FTS5 column declaration order (column indexes start at 0)

---

### fieldSpecs? \{#fieldspecs\}

```ts
readonly fieldSpecs?: readonly FtsField[];
```

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L59)

Field metadata, used to build array/scalar-safe snippets

---

### offset \{#offset\}

```ts
readonly offset: number;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L65)

In-memory over-fetch offset. Each per-field subquery fetches `offset + pageSize` rows; the SQL OFFSET is fixed at 0

---

### pageSize \{#pagesize\}

```ts
readonly pageSize: number;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L63)

Upper limit of results per page

---

### primaryKey \{#primarykey\}

```ts
readonly primaryKey: string;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L55)

Primary key column name of the business table (= FTS5 rowid)

---

### schema? \{#schema\}

```ts
readonly schema?: string;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L51)

PostgreSQL schema name (= the entity's `namespace`); ignored by the SQLite backend.

Two different ways of landing the same namespace, and not interchangeable with [SearchEngineQuery.sqlTable](#sqltable): the pg adapter creates `"<namespace>"."<table>"`, while the sqlite adapter creates `<namespace>$<table>`.

---

### snippetLength? \{#snippetlength\}

```ts
readonly snippetLength?: number;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L67)

Snippet length (in characters), default 120

---

### sqlTable? \{#sqltable\}

```ts
readonly sqlTable?: string;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L43)

SQLite physical table name (including the namespace prefix)

---

### table \{#table\}

```ts
readonly table: string;
```

Defined in: [packages/rxdb-plugin-search/src/core/search-engine.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/search-engine.ts#L41)

Business table name
