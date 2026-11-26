# WorktreeTableSet

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L85)

A set of business tables.

## Remarks

- The **main table set** ([WorktreeTableSet.MAIN](#main)) is simply the existing business tables: no suffix, and no "copy" concept,
  [WorktreeTableSet.has](#has) answers no for everyone, and the resolver produces physical names byte-for-byte identical to those before checkouts were introduced.
- A **writable checkout's table set** ([WorktreeTableSet.of](#of)) only creates copies for registered entities: business entities that entered the versioned domain.
  All other entities (system tables, QueryCache, entities with their change log turned off) read from and write to the main table set regardless of which set is mounted.

Instances only come from these two sources; the constructor is private: there is only one main table set, and the resolver decides the main table set via [WorktreeTableSet.isMain](#ismain).

## Properties

### suffix \{#suffix\}

```ts
readonly suffix: string | null;
```

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L92)

The physical name suffix; `null` for the main table set

***

### MAIN \{#main\}

```ts
readonly static MAIN: WorktreeTableSet;
```

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L89)

The main checkout's set: the existing business tables

## Accessors

### heldBranchWhere \{#heldbranchwhere\}

#### Get Signature

```ts
get heldBranchWhere(): WorktreeHeldBranchWhere;
```

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L121)

How to look up the branch this table set's checkout holds: `activated = true` for the main table set, `activeKey = the hold key` for a shadow table set

##### Remarks

"The current branch of this instance" is the branch held by the table set this instance mounts (US-314 B1.4); everywhere in the core and plugins that needs to read the current branch uses it,
instead of each writing its own `activated = true`. The main table set is still queried by `activated` rather than by the sentinel: databases from before the system migration backfilled
`activeKey` must still be able to read the current branch, and after the migration the two are equivalent (`activated ⇔ activeKey = sentinel`).

##### Returns

[`WorktreeHeldBranchWhere`](../type-aliases/WorktreeHeldBranchWhere.md)

***

### holderKey \{#holderkey\}

#### Get Signature

```ts
get holderKey(): string;
```

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L109)

The key written into `rxdb_branch.activeKey` when this table set's checkout holds a branch

##### Remarks

The main table set is the main checkout: the sentinel [ACTIVE\_BRANCH\_KEY](../variables/ACTIVE_BRANCH_KEY.md); shadow table sets are `*worktree:<suffix>*` (US-314 B1.3).

Derived from the table set instead of starting a separate id: this branch-table row thus states both "who holds it" and "which table set it is". System migrations run before plugins are installed,
so without relying on plugins' checkout registries each table set can still be matched to the branch it should mount; there is also no second registry that could drift from it. `*` is a reserved character in branch ids,
so hold keys cannot be mistaken for branch names.

##### Returns

`string`

***

### isMain \{#ismain\}

#### Get Signature

```ts
get isMain(): boolean;
```

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L95)

Whether it is the main checkout's set

##### Returns

`boolean`

## Methods

### accepts() \{#accepts\}

```ts
accepts(metadata, eventSuffix): boolean;
```

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:221](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L221)

Whether an instance mounting this table set accepts an entity event: whether the table the event row lives in is the table this entity reads on this set.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | \| `Readonly`&lt;[`EntityMetadataType`](../interfaces/EntityMetadataType.md)&gt; \| `undefined` | The metadata of the entity in the event; events with no metadata found (unrecognized entities) are always accepted |
| `eventSuffix` | `string` \| `undefined` | The event's `tableSetSuffix`: which shadow table set the write landed on; the default is the main table set |

#### Returns

`boolean`

`true` when accepted

#### Remarks

Entities without copies (system tables, QueryCache, change-log-off entities) read the main table set regardless of which set is mounted, and on the main table set their events are accepted by everyone;
entities with copies only accept events on their own set. Multiple tabs on the main checkout are judged by table set, not by branch: one tab switched branches,
while another tab still mounts the same main tables and reads the new branch's data; filtering by branch would keep those events out.

***

### eventTagOf() \{#eventtagof\}

```ts
eventTagOf(metadata): object;
```

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:235](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L235)

The table set tag an entity's event should carry on this set, spread into the event data: writes on a shadow table carry `tableSetSuffix`, writes on the main table set carry nothing.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | Entity metadata |

#### Returns

`object`

`{ tableSetSuffix }` or an empty object

##### tableSetSuffix?

```ts
readonly tableSetSuffix?: string;
```

#### Remarks

Writes on the main table set do not carry a key with the value `undefined`: in databases without checkouts, the event shape is byte-for-byte the same as before.

***

### has() \{#has\}

```ts
has(metadata): boolean;
```

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:191](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L191)

Whether this entity has its own copy in this table set.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | Entity metadata |

#### Returns

`boolean`

`true` when it has a copy; always `false` for the main table set

***

### ownerSuffixOf() \{#ownersuffixof\}

```ts
ownerSuffixOf(metadata): string | undefined;
```

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:205](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L205)

Which table set an entity's writes land on in this set: with a copy they land on this set (returns the suffix), without one they land on the main table set (returns `undefined`).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | Entity metadata |

#### Returns

`string` \| `undefined`

The shadow table set's suffix; `undefined` when they land on the main table set

#### Remarks

Local entity events carry it (`tableSetSuffix`, US-314 B2.3). Event-emitting paths outside change rows (branch switching, undo / redo, pull backfill, creating entities)
are tagged by the table set that initiated the write, judging the same thing as [WorktreeTableSet.accepts](#accepts).

***

### isSuffix() \{#issuffix\}

```ts
static isSuffix(value): boolean;
```

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:168](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L168)

Whether it matches the table set suffix shape (`wt_` plus 1–12 lowercase letters or digits).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `string` | The segment cut from a physical name in the catalog or a schema name |

#### Returns

`boolean`

`true` when the shape matches

#### Remarks

Adapters use it to recognize suffixes when enumerating existing table sets in the catalog (US-314 B2.6 orphan reclamation), the same rule as [WorktreeTableSet.of](#of).

***

### of() \{#of\}

```ts
static of(suffix, entities): WorktreeTableSet;
```

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:140](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L140)

A writable checkout's table set.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `suffix` | `string` | The physical name suffix: `wt_` plus 1–12 lowercase letters or digits |
| `entities` | `Iterable`&lt;[`EntityType`](../type-aliases/EntityType.md)&gt; | The entities that have their own copies in this table set |

#### Returns

`WorktreeTableSet`

The table set

#### Throws

[RxDBError](RxDBError.md) when the suffix does not match the shape

***

### schemaFingerprintOf() \{#schemafingerprintof\}

```ts
static schemaFingerprintOf(entities): string;
```

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:181](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L181)

The structure fingerprint of a table set (US-314 B2.6): the structure of the member entities, additionally considering constraints (`checks` / `exclusions`) and `log` beyond the backup manifest's structure fingerprint.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entities` | readonly [`EntityType`](../type-aliases/EntityType.md)[] | The members of this table set |

#### Returns

`string`

64 hex-digit SHA-256; independent of declaration order

#### Remarks

Recorded when a writable checkout is opened (combined with the plugin hooks' fingerprints, see `RxDB.worktreeTableSetFingerprint`); if it does not match at mount time, the whole set is rebuilt.

***

### suffixOfHolderKey() \{#suffixofholderkey\}

```ts
static suffixOfHolderKey(activeKey): string | null;
```

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:155](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L155)

Reads the shadow table set's suffix back from a hold key.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `activeKey` | `string` | The value in `rxdb_branch.activeKey` |

#### Returns

`string` \| `null`

The suffix; `null` for the main checkout's sentinel or values not matching the [WorktreeTableSet.holderKey](#holderkey) shape
