# FtsInstallPlan

Defined in: [packages/rxdb-plugin-search/src/core/fts5-installer.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/fts5-installer.ts#L19)

FTS5 install plan for a single entity

## Properties

### fields \{#fields\}

```ts
readonly fields: readonly FtsField[];
```

Defined in: [packages/rxdb-plugin-search/src/core/fts5-installer.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/fts5-installer.ts#L48)

List of extracted searchable fields

---

### primaryKey \{#primarykey\}

```ts
readonly primaryKey: string;
```

Defined in: [packages/rxdb-plugin-search/src/core/fts5-installer.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/fts5-installer.ts#L46)

Primary key column name of the source table (external-content mode `content_rowid`)

---

### schema? \{#schema\}

```ts
readonly schema?: string;
```

Defined in: [packages/rxdb-plugin-search/src/core/fts5-installer.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/fts5-installer.ts#L44)

The schema this table lives in on PostgreSQL (unquoted); when omitted it is not restricted, and is left to `search_path`.

#### Remarks

The two backends land the namespace on **different things**, so this must coexist with [FtsInstallPlan.sqlTableName](#sqltablename) rather than being an either/or: SQLite has no schema, so the adapter folds the namespace into the table name (`public$article`); the PostgreSQL adapter creates a real schema, with the table being `"public"."article"`. The pg backend previously copied `sqlTableName`, so all DDL and queries pointed at a nonexistent `"public$article"` — a straight 42P01 on a real database.

Only filled in by pg-tsvector's `SearchBackend.bindPlan` via the adapter's table name resolver: for the main table set it is the namespace itself, for a writable checkout's shadow tables it is `<namespace>$<suffix>` (US-314 B2.5). Using the namespace directly as the schema means shadow tables can never be found.

---

### signature \{#signature\}

```ts
readonly signature: string;
```

Defined in: [packages/rxdb-plugin-search/src/core/fts5-installer.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/fts5-installer.ts#L50)

Schema signature (for runtime drift detection)

---

### sqlTableName? \{#sqltablename\}

```ts
readonly sqlTableName?: string;
```

Defined in: [packages/rxdb-plugin-search/src/core/fts5-installer.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/fts5-installer.ts#L29)

SQLite physical table name (including the namespace prefix, e.g. `public$article`).

#### Remarks

extractFtsPlanFromMetadata provides the main table set's; a writable checkout's shadow tables are switched to that table set's by `SearchBackend.bindPlan` via the adapter's table name resolver (`public$article$wt_x`, US-314 B2.5).

---

### tableName \{#tablename\}

```ts
readonly tableName: string;
```

Defined in: [packages/rxdb-plugin-search/src/core/fts5-installer.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/core/fts5-installer.ts#L21)

Source table name (referenced by the FTS5 external-content table `_fts_<tableName>`)
