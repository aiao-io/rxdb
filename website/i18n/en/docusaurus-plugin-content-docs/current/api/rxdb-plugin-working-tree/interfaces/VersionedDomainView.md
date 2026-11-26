# VersionedDomainView

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L129)

The versioned domain projected onto the **table / column** plane — the port the raw-write judgment consumes.

## Remarks

Deliberately only two members: what the raw judgment receives is a SQL statement; it recognizes only table names and column names, not entity names,
and certainly not the concept of "QueryCache" — it only checks whether a table is in the set. A wider port would let the judgment branch on entity
semantics, and the same thing would then have one criterion on the entity plane and another on the table plane.

## Extended by

- [`VersionedDomain`](VersionedDomain.md)

## Properties

### versionedTables \{#versionedtables\}

```ts
readonly versionedTables: ReadonlySet<string>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:147](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L147)

The set of **addressable table names** of all tracked entities, lowercase, unquoted, no dot-schema qualification

#### Remarks

If it held entity names, `UPDATE post` would never match `Post`, and the whole raw defense line would silently fail.

The names come from the adapter ([VersionedDomainEntityInput.physicalTableNames](VersionedDomainEntityInput.md#physicaltablenames)), usually two per table:
the logical table name (`post`) and the physical table name after the SQLite family folds the namespace in (`public$post`). Both are needed,
because the 6 v1 backends come in two physical shapes — PGlite has real schemas, table references look like `"public"."post"`, and the judgment strips
the dot qualification to get back to `post`; the other 5 SQLite-family backends have **no** schema, the namespace is folded into the name itself,
and that is the **only** table name they can use. If only the logical name were registered, the raw gate would fail entirely on 5/6 of the backends: users could write
through versioned business tables using the only table name the backend accepts, the capture chain would know nothing, and cold replay would no longer reconcile.

Aliases are registered instead of having the judgment split on `$`: `_fts_public$post` (rxdb-plugin-search's shadow table,
an explicitly out-of-domain target in spec.md) would split to exactly `post`, and a write that should pass would start erroring.
The judgment side keeps doing pure set membership, and each additional physical shape is reported by the **adapter that writes the table**.

## Methods

### untrackedFieldsOf() \{#untrackedfieldsof\}

```ts
untrackedFieldsOf(table): ReadonlySet<string>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L155)

Fetches the set of columns on a table that do not constitute a net business change

#### Parameters

| Parameter | Type     | Description                      |
| --------- | -------- | -------------------------------- |
| `table`   | `string` | The table name; case-insensitive |

#### Returns

`ReadonlySet`&lt;`string`&gt;

The table's global bookkeeping fields ∪ its own registered derived index columns
