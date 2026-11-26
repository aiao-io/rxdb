# SearchBackend

Defined in: [packages/rxdb-plugin-search/src/backend/search-backend.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/search-backend.ts#L54)

A complete implementation of one full-text search backend.

## Properties

### capabilities \{#capabilities\}

```ts
readonly capabilities: SearchBackendCapabilities;
```

Defined in: [packages/rxdb-plugin-search/src/backend/search-backend.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/search-backend.ts#L58)

Capabilities declared by the backend

---

### id \{#id\}

```ts
readonly id: SearchBackendId;
```

Defined in: [packages/rxdb-plugin-search/src/backend/search-backend.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/search-backend.ts#L56)

Backend identifier

## Methods

### assertCapabilities() \{#assertcapabilities\}

```ts
assertCapabilities(executor, adapter): Promise<void>;
```

Defined in: [packages/rxdb-plugin-search/src/backend/search-backend.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/search-backend.ts#L90)

Verifies the storage capabilities the backend needs against a **live connection**; throws when something is missing.

This is the second of the two guard layers: the first (the registry) can only tell which engine family an adapter belongs to, not whether this specific build has FTS5 compiled in or has registered custom functions like `rxdb_fts_bigram`.

#### Parameters

| Parameter  | Type                                          | Description                                       |
| ---------- | --------------------------------------------- | ------------------------------------------------- |
| `executor` | [`RuntimeSqlExecutor`](RuntimeSqlExecutor.md) | Bootstrap-phase SQL executor                      |
| `adapter`  | `string`                                      | Current adapter name (only for error attribution) |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

When capabilities are missing, with a distinguishable reason

---

### bindPlan() \{#bindplan\}

```ts
bindPlan(
   plan,
   metadata,
   tableSet
): Promise<FtsInstallPlan>;
```

Defined in: [packages/rxdb-plugin-search/src/backend/search-backend.ts:116](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/search-backend.ts#L116)

Binds a plan to a set of business tables (US-314 B2.5): the physical location is replaced with that table set's via the adapter's table name resolver.

#### Parameters

| Parameter  | Type                                                          | Description                                                                                    |
| ---------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `plan`     | [`FtsInstallPlan`](FtsInstallPlan.md)                         | The install plan derived from entity metadata                                                  |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Metadata of the entity the plan belongs to                                                     |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)  | The table set to bind to; entities that are not members of it still land in the main table set |

#### Returns

`Promise`&lt;[`FtsInstallPlan`](FtsInstallPlan.md)&gt;

The bound plan: FTS5 switches `sqlTableName`, pg-tsvector switches `schema`

#### Remarks

Both installation and querying only recognize bound plans. Physical naming belongs to the adapter; the backend does not assemble it itself: one wrong assembly would make the full-text index on a shadow table get built on — and queried against — the main table.

---

### compile() \{#compile\}

```ts
compile(query): CompiledQuery | null;
```

Defined in: [packages/rxdb-plugin-search/src/backend/search-backend.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/search-backend.ts#L69)

Compiles user input into the matching expression for this backend.

Must be usable at **construction time**: both `isSearchableQuery` and the result-pool cache key depend on it, and both can be called before `install()` completes.

#### Parameters

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| `query`   | `string` | Raw input   |

#### Returns

`CompiledQuery` \| `null`

Compilation result; returns `null` when empty after normalization (not treated as an error)

---

### createEngine() \{#createengine\}

```ts
createEngine(executor): SearchEngine;
```

Defined in: [packages/rxdb-plugin-search/src/backend/search-backend.ts:135](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/search-backend.ts#L135)

Binds the query executor and produces a backend-independent [SearchEngine](SearchEngine.md).

#### Parameters

| Parameter  | Type                                            | Description              |
| ---------- | ----------------------------------------------- | ------------------------ |
| `executor` | [`FtsExecutor`](../type-aliases/FtsExecutor.md) | Query-phase SQL executor |

#### Returns

[`SearchEngine`](SearchEngine.md)

---

### install() \{#install\}

```ts
install(
   plan,
   executor,
   migrationStore
): Promise<InstallFtsResult>;
```

Defined in: [packages/rxdb-plugin-search/src/backend/search-backend.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/search-backend.ts#L99)

Installs the full-text index of a single entity; idempotent, and decidable after interruption (US-703 AC#4 / AC#7).

#### Parameters

| Parameter        | Type                                              | Description                                   |
| ---------------- | ------------------------------------------------- | --------------------------------------------- |
| `plan`           | [`FtsInstallPlan`](FtsInstallPlan.md)             | The install plan derived from entity metadata |
| `executor`       | [`RuntimeSqlExecutor`](RuntimeSqlExecutor.md)     | Bootstrap-phase SQL executor                  |
| `migrationStore` | [`MigrationRecordStore`](MigrationRecordStore.md) | Migration record read/write                   |

#### Returns

`Promise`&lt;[`InstallFtsResult`](InstallFtsResult.md)&gt;

---

### installForTableSet() \{#installfortableset\}

```ts
installForTableSet(plan, executor): Promise<InstallFtsResult>;
```

Defined in: [packages/rxdb-plugin-search/src/backend/search-backend.ts:128](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/search-backend.ts#L128)

Installs the full-text index on the shadow tables of a writable checkout and backfills it (US-314 B2.5); idempotent, writes no migration records.

#### Parameters

| Parameter  | Type                                          | Description                                                                    |
| ---------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| `plan`     | [`FtsInstallPlan`](FtsInstallPlan.md)         | The plan already bound to that table set ([SearchBackend.bindPlan](#bindplan)) |
| `executor` | [`RuntimeSqlExecutor`](RuntimeSqlExecutor.md) | The executor of the transaction that creates the table set or backfills it     |

#### Returns

`Promise`&lt;[`InstallFtsResult`](InstallFtsResult.md)&gt;

#### Remarks

Migration records only cover the main table set: signature drift is already reported at the main table set's [SearchBackend.install](#install). Shadow tables are created with the checkout and deleted with the checkout; if the structure is complete they are skipped, if missing they are backfilled.

---

### installMigrationPrefix() \{#installmigrationprefix\}

```ts
installMigrationPrefix(tableName): string;
```

Defined in: [packages/rxdb-plugin-search/src/backend/search-backend.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/backend/search-backend.ts#L78)

The install record prefix this backend uses in the `rxdb_migration` table.

The two backends each occupy their own namespace, so records with the same name are not misread by each other as "already installed".

#### Parameters

| Parameter   | Type     | Description         |
| ----------- | -------- | ------------------- |
| `tableName` | `string` | Physical table name |

#### Returns

`string`
