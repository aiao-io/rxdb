# VersionedDomain

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L187)

The complete view of the versioned domain: the table / column plane (inherited from [VersionedDomainView](VersionedDomainView.md)) plus the entity plane.

## Remarks

Inheritance rather than two side-by-side interfaces: when the two shapes diverge, the line that passes VersionedDomain as a [VersionedDomainView](VersionedDomainView.md) fails to compile first, instead of waiting for someone to copy a second list over on the raw-judgment side.

## Extends

- [`VersionedDomainView`](VersionedDomainView.md)

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

#### Inherited from

[`VersionedDomainView`](VersionedDomainView.md).[`versionedTables`](VersionedDomainView.md#versionedtables)

## Methods

### classifyEntity() \{#classifyentity\}

```ts
classifyEntity(entityName, namespace?): VersionedEntityClass;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:219](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L219)

Whether this entity is under version control

#### Parameters

| Parameter    | Type     | Description                                                                               |
| ------------ | -------- | ----------------------------------------------------------------------------------------- |
| `entityName` | `string` | The entity name                                                                           |
| `namespace?` | `string` | When known, matched exactly by identity; when omitted, matched by bare name (see remarks) |

#### Returns

[`VersionedEntityClass`](../type-aliases/VersionedEntityClass.md)

`'untracked'` when registered as [SyncType.QueryCache](../../rxdb/enumerations/SyncType.md#querycache) or with the change log disabled (`log: false`), `'tracked'` for everything else

#### Remarks

An unregistered entity is `'tracked'` — this is the realized form of "everything outside the four classes is versioned". **A namespace mismatch also counts as unregistered**,
without falling back to the bare-name entry: falling back would demote `namespace` to a hint, and a same-named entity under another namespace
would inherit a classification that has nothing to do with it.

When a bare name (mount point 4 only has the entity name, and `RxDBAdapter.upsertMany()`'s contract has no namespace) hits multiple
registrations, only **agreement** among them counts; different answers fall back to `'tracked'`. Judging untracked on ambiguity
would silently drop one of those business tables out of version control, while tracked is the discoverable, fixable direction.

---

### createTransactionGuard() \{#createtransactionguard\}

```ts
createTransactionGuard(): VersionedTransactionGuard;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:240](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L240)

Opens a transaction-level mixing guard

#### Returns

[`VersionedTransactionGuard`](VersionedTransactionGuard.md)

A new instance unaffected by other guards

#### Remarks

A new instance on every call: the guard holds the categories seen by **one particular transaction**, and sharing an instance would let one transaction's mixing pollute the next.

---

### hasEntity() \{#hasentity\}

```ts
hasEntity(entityName, namespace?): boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:201](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L201)

Has this database registered this entity?

#### Parameters

| Parameter    | Type     | Description                                                                                          |
| ------------ | -------- | ---------------------------------------------------------------------------------------------------- |
| `entityName` | `string` | The entity name                                                                                      |
| `namespace?` | `string` | When known, matched exactly by identity; when omitted, matched by bare name against any registration |

#### Returns

`boolean`

`true` when at least one registration matches

#### Remarks

A separate member from [classifyEntity](#classifyentity) because the two answer different questions: classification gives unregistered entities a **default value** (`'tracked'`), and cannot tell "registered and tracked" apart from "never registered".
The capture side relies on exactly this difference to judge system tables — a name the domain recognizes is guaranteed to be a business entity (system tables were removed when the domain was built),
so "it is in the domain" is itself proof of "it is not a system table", and the system table list only speaks for names the domain does not recognize.

---

### isUntrackedField() \{#isuntrackedfield\}

```ts
isUntrackedField(
   entityName,
   field,
   namespace?
): boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:229](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L229)

Whether a change to this field constitutes a net business change

#### Parameters

| Parameter    | Type     | Description                                                                                                                      |
| ------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `entityName` | `string` | The entity name                                                                                                                  |
| `field`      | `string` | The entity property name                                                                                                         |
| `namespace?` | `string` | When known, matched exactly by identity; when omitted, matched by bare name, same criterion as [classifyEntity](#classifyentity) |

#### Returns

`boolean`

`true` when it matches any of the four untracked classes

---

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

#### Inherited from

[`VersionedDomainView`](VersionedDomainView.md).[`untrackedFieldsOf`](VersionedDomainView.md#untrackedfieldsof)
