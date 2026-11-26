# VersionedDomainEntityInput

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L72)

A single entity registration needed to construct the versioned domain

## Remarks

The four required fields map to the judgment's three planes: `entityName` and `namespace` together are the identity callers ask about on the entity plane, `physicalTableNames` are the names raw judgment sees in SQL, and `syncType` decides the first untracked category. Missing any one forces downstream code to look it up in metadata again — and that is where "the second list" begins. The optional `log` decides the fourth category, and `derivedIndexColumns` is the registration entry for the third.

## Properties

### derivedIndexColumns? \{#derivedindexcolumns\}

```ts
readonly derivedIndexColumns?: readonly string[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:118](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L118)

The derived index columns a plugin statically declares **on this business table** (the third untracked category)

#### Remarks

Registered per table rather than merged into a global set: merging into one set exempts a column name registered on table A from table B as well, and this set is something plugins can write into.

---

### entityName \{#entityname\}

```ts
readonly entityName: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L74)

The entity name (`@Entity({ name })`), case-sensitive

---

### log? \{#log\}

```ts
readonly log?: boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L109)

Whether this entity writes a change log (`@Entity({ log })`); `false` is the fourth untracked category

#### Remarks

Defaults to `true`, consistent with the core entity metadata's default: the criterion is the **explicitly declared** `log: false`, not "no log written". An entity with the change log disabled produces no `rxdb_change`, and capture, branch projection, history and sync push are all built on top of it — none of them can see this table.

---

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L83)

The entity's namespace (`@Entity({ namespace })`)

#### Remarks

Required rather than defaulting to `'public'` when omitted: it is half of the registration's identity key (`public:Post`), the same shape as the key the core's `isSystemEntity()` uses. With a default value, same-named entities under two namespaces collide into one registration.

---

### physicalTableNames \{#physicaltablenames\}

```ts
readonly physicalTableNames: readonly string[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L97)

All the names this table can be written as in the SQL **this backend** emits

#### Remarks

Given by RxDBAdapterLocalBase.physicalTableNames; the domain guesses not a single character. The SQLite family has no schema, the namespace is folded into the name itself (`public$post`), and that is the **only** table name they can use; PGlite has real schemas, and `"public"."post"` has already returned to the logical name at raw judgment's qualification-stripping step. Making the domain assemble its own copy by splitting on `'$'` creates a second copy of the rule — a second copy doesn't error when the original changes, it just starts failing to recognize some version-controlled table, and the raw gate **silently lets it through**.

Normalized to lowercase and de-duplicated at construction; an empty list (or one with only blank names) throws, see [buildVersionedDomain](../functions/buildVersionedDomain.md).

---

### syncType \{#synctype\}

```ts
readonly syncType: SyncType;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L100)

The entity's sync strategy; [SyncType.QueryCache](../../rxdb/enumerations/SyncType.md#querycache) is the first untracked category
