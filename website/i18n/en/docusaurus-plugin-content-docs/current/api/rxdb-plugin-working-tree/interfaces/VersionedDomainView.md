# VersionedDomainView

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L129)

The versioned domain's projection on the **table / column** plane, i.e. the port raw-write judgment consumes

## Remarks

The members are deliberately only two: raw judgment receives a piece of SQL, it recognizes only table names and column names, not entity names, and certainly not the "QueryCache" concept — it only checks whether the table is in the set. Opening the port wider would make the judgment branch on entity semantics, giving the same thing one criterion on the entity plane and another on the table plane.

## Extended by

- [`VersionedDomain`](VersionedDomain.md)

## Properties

### versionedTables \{#versionedtables\}

```ts
readonly versionedTables: ReadonlySet<string>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:147](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L147)

The **addressable table name** set of all tracked entities, lowercase, unquoted, no dotted schema qualification

#### Remarks

Put entity names in and `UPDATE post` never matches `Post`, silently disabling the whole raw defense line.

The names come from the adapter ([VersionedDomainEntityInput.physicalTableNames](VersionedDomainEntityInput.md#physicaltablenames)); a table usually has two: the logical table name (`post`) and the physical table name after the SQLite family folds the namespace in (`public$post`). Both are needed because the 6 v1 backends come in two physical shapes — PGlite has real schemas, table references are `"public"."post"`, and after the judgment strips the dotted qualification it returns to `post`; the other 5 SQLite-family backends have **no** schema, the namespace is folded into the name itself, and that is the **only** table name they can use. Registering only the logical name disables the raw gate entirely on 5/6 of the backends: users can write through versioned business tables using the only table name the backend accepts, the capture chain knows nothing, and cold replay never matches again.

Register the alias rather than making the judgment split on `$`: `_fts_public$post` (rxdb-plugin-search's shadow table, an explicitly out-of-domain target in spec.md) splits exactly into `post`, so a write that should pass starts erroring. The judgment side keeps doing set membership only; a new physical shape is reported by **the adapter that writes the table** reporting one more name.

## Methods

### untrackedFieldsOf() \{#untrackedfieldsof\}

```ts
untrackedFieldsOf(table): ReadonlySet<string>;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L155)

Gets the column set that does not constitute a net business change on some table

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `table` | `string` | The table name; case-insensitive |

#### Returns

`ReadonlySet`&lt;`string`&gt;

The table's global bookkeeping fields ∪ its own registered derived index columns
