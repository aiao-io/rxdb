# VersionedDomain

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:187](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L187)

The complete view of the versioned domain: the table / column plane (inherited from [VersionedDomainView](VersionedDomainView.md)) plus the entity plane

## Remarks

Inherits rather than sits alongside the two interfaces: when the two shapes diverge, the line that passes a VersionedDomain where a
[VersionedDomainView](VersionedDomainView.md) is expected fails to compile first, instead of someone copying out a second list over on the raw judgment side.

## Extends

- [`VersionedDomainView`](VersionedDomainView.md)

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

#### Inherited from

[`VersionedDomainView`](VersionedDomainView.md).[`versionedTables`](VersionedDomainView.md#versionedtables)

## Methods

### classifyEntity() \{#classifyentity\}

```ts
classifyEntity(entityName, namespace?): VersionedEntityClass;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:219](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L219)

Does this entity go under version control

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityName` | `string` | The entity name |
| `namespace?` | `string` | Exact identity match when known; bare-name match when omitted (see remarks) |

#### Returns

[`VersionedEntityClass`](../type-aliases/VersionedEntityClass.md)

`'untracked'` when registered as [SyncType.QueryCache](../../rxdb/enumerations/SyncType.md#querycache) or with the change log disabled (`log: false`), `'tracked'` for everything else

#### Remarks

Unregistered entities are `'tracked'` — that is the concrete form of "everything outside the four categories is versioned". **A namespace mismatch also counts as unregistered**, without falling back to the bare-name entry: falling back demotes `namespace` to a hint, and a same-named entity under another namespace inherits a classification that has nothing to do with it.

When a bare name (mount point 4 has only the entity name; `RxDBAdapter.upsertMany()`'s contract has no namespace) hits multiple registrations, they only count when they **agree**; different answers fall back to `'tracked'`. Judging untracked on ambiguity would let that business table silently leave version control, while tracked is the discoverable, fixable direction.

***

### createTransactionGuard() \{#createtransactionguard\}

```ts
createTransactionGuard(): VersionedTransactionGuard;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:240](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L240)

Opens a transaction-level mixing guard

#### Returns

[`VersionedTransactionGuard`](VersionedTransactionGuard.md)

A new instance that does not interfere with other guards

#### Remarks

A new instance per call: the guard holds **one transaction's** seen categories, and sharing one instance lets one transaction's mixing pollute the next.

***

### hasEntity() \{#hasentity\}

```ts
hasEntity(entityName, namespace?): boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:201](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L201)

Has this database registered this entity

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityName` | `string` | The entity name |
| `namespace?` | `string` | Exact identity match when known; bare-name match against any registration when omitted |

#### Returns

`boolean`

`true` when at least one registration matches

#### Remarks

A separate member from [classifyEntity](#classifyentity) because the two answer different questions: classification gives unregistered entities a **default value** (`'tracked'`), unable to tell "registered and tracked" from "never registered". And the capture side relies on exactly this difference to judge system tables — names the domain recognizes are necessarily business entities (system tables were removed when the domain was built), so "in the domain" is itself proof of "not a system table", and the system-table list only has a say for names the domain does not recognize.

***

### isUntrackedField() \{#isuntrackedfield\}

```ts
isUntrackedField(
   entityName, 
   field, 
   namespace?
): boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:229](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L229)

Does a change to this field constitute a net business change

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entityName` | `string` | The entity name |
| `field` | `string` | The entity property name |
| `namespace?` | `string` | Exact identity match when known; bare-name match when omitted, same criterion as [classifyEntity](#classifyentity) |

#### Returns

`boolean`

`true` when it matches any of the four untracked categories

***

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

#### Inherited from

[`VersionedDomainView`](VersionedDomainView.md).[`untrackedFieldsOf`](VersionedDomainView.md#untrackedfieldsof)
