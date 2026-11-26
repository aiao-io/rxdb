# VersionedDomainEntityInput

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L72)

One entity registration needed to build the versioned domain.

## Remarks

The four required fields correspond to the judgment's three planes: `entityName` and `namespace` together are the identity the caller asks about at the entity layer, `physicalTableNames` is the name the raw judgment sees in SQL, `syncType` decides the first untracked class.
Missing any one would force downstream to look it up in the metadata again, and that is where a "second list" begins. The optional `log` decides the fourth class,
`derivedIndexColumns` is the registration port for the third.

## Properties

### derivedIndexColumns? \{#derivedindexcolumns\}

```ts
readonly derivedIndexColumns?: readonly string[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:118](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L118)

The derived index columns a plugin statically declares **on this business table** (the third untracked class)

#### Remarks

Registered per table rather than merged into one global set: squashing into one set would exempt a column name registered on table A on table B too,
and this set is something plugins can write into.

***

### entityName \{#entityname\}

```ts
readonly entityName: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L74)

The entity name (`@Entity({ name })`), case-sensitive

***

### log? \{#log\}

```ts
readonly log?: boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L109)

Whether this entity writes a change log (`@Entity({ log })`); `false` is the fourth untracked class

#### Remarks

Defaults to `true`, consistent with the core entity metadata's default: the criterion is an **explicitly declared** `log: false`, not "no log written".
An entity with the change log disabled produces no `rxdb_change`; capture, branch projection, history and sync push are all built on top of it, and none of them can see this table.

***

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L83)

The entity's namespace (`@Entity({ namespace })`)

#### Remarks

Required rather than defaulting to `'public'` when omitted: it is half of the registration's identity key (`public:Post`), the same shape as the key the core's `isSystemEntity()` uses.
With a default value, same-named entities under two namespaces would collide into one registration.

***

### physicalTableNames \{#physicaltablenames\}

```ts
readonly physicalTableNames: readonly string[];
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L97)

All the names this table may be written as in the SQL emitted by **this backend**

#### Remarks

Provided by RxDBAdapterLocalBase.physicalTableNames; the domain guesses not a single name. The SQLite family has no
schema, the namespace is folded into the name itself (`public$post`), and that is the **only** table name they can use; PGlite has a real
schema, and `"public"."post"` has already returned to the logical name in the qualification-stripping step of the raw judgment. If the domain composed
its own by splitting on `'$'`, the rule would have a second copy — a second copy does not error when the original changes, it just starts
failing to recognize some version-controlled table, and the raw gate then **silently lets it through**.

Normalized to lowercase and deduplicated at construction; an empty list (or only blank names) throws immediately, see [buildVersionedDomain](../functions/buildVersionedDomain.md).

***

### syncType \{#synctype\}

```ts
readonly syncType: SyncType;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L100)

The entity's sync strategy; [SyncType.QueryCache](../../rxdb/enumerations/SyncType.md#querycache) is the first untracked class
