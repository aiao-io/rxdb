# RxDBBranch

Defined in: [packages/rxdb/src/system/branch.ts:138](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L138)

Branch table

Records the current branch's information, including whether it is active, whether it is a local branch, whether it is a remote branch, etc.

## Remarks

The `parent` / `children` below are self-referencing relations, **not** a tree entity declaration — branches deliberately use `@Entity`
rather than `@TreeEntity`. The `parentId` column is produced by the `parent` MANY_TO_ONE relation and has nothing to do with the tree capability.

Tree queries are not used because using them would be wrong: a recursive CTE encountering broken links or cycles only truncates silently, returning
a tree missing branches instead of an error, and it cannot give ordered paths or per-segment `fromChangeId` ranges. Branch parent-chain traversal is hand-written
everywhere (`getPathToRoot` / `collectBranchChain` / `sync_branches` / `remove_branch`),
each carrying its own bad-data detection. Do not put `@TreeEntity` back.

**`activeKey` records "which checkout holds this branch"**: `NULL` means nobody holds it, the sentinel `'*active*'` is the main checkout
(in and out together with `activated`, the convention `activated ⇔ activeKey = '*active*'`), and everything else is a writable checkout's hold key
(US-314 B1.2). It exists to make the hold relationship a **unique constraint** — "only one true" cannot be expressed on a boolean column,
but a `unique` + `nullable` column can: one cell only holds one value, so a branch has at most one holder; the same key at most
appears once, so the main checkout rests on at most one branch and each writable checkout holds at most one branch.

The cost is that these invariants are hand-maintained at 17 production write sites: the database-initial row in core `RxDB.ts`, the two places each in
`system-repositories.ts` and `active-branch-guard.ts` that light up `main`, the branch-row creation in the history plugin's `create-branch.ts` and the sync plugin's
`sync-branches.ts`, plus the switch (extinguish, light up) and migrate (clear old sentinels, backfill, light up with zero active) SQL in the pglite / sqlite-core
adapters. Every site carries a "missing one site bypasses the unique constraint" comment, and the sites where the main checkout holds a branch must first go through
`WorktreeBranchHeldError.throwIfHeld` — the invariants are guarded by people, not mechanically guaranteed.

The real fix is to express the `activated` half in the schema: change `activated` into a generated column derived from `activeKey`
(`GENERATED ALWAYS AS (activeKey = '*active*')`), leaving only the `activeKey` column at write sites. The two pre-B1.2
directions (`activeKey` as a generated column, or dropping it in favor of a partial unique index on `activated`) cannot carry hold keys and no longer hold.
It was not done because it would touch six adapters' system schema migrations and require migration steps for existing databases; changing write sites without
changing the schema means swapping handwriting for the same number of calls, and the invariants would still be guarded by people. See
"epic-006 deferred architecture items" in `requirements/roadmap.md` for the deferral record.

## Constructors

### Constructor

```ts
new RxDBBranch(): RxDBBranch;
```

#### Returns

`RxDBBranch`

## Properties

### activated \{#activated\}

```ts
activated: boolean;
```

Defined in: [packages/rxdb/src/system/branch.ts:157](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L157)

Whether it is active

***

### activeKey? \{#activekey\}

```ts
activeKey?: string | null;
```

Defined in: [packages/rxdb/src/system/branch.ts:176](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L176)

Hold key: `ACTIVE_BRANCH_KEY` when the main checkout rests on this branch, that checkout's hold key when held by a writable checkout,
`null` when nobody holds it

#### Remarks

Unique constraint + `NULL` not participating in uniqueness comparison = at most one active branch per database, and each writable checkout holds at most one branch.
Only the schema can catch this constraint: however strict the runtime guard, it can only find out **after** both rows are written — and by then
"who is the current branch" no longer has an answer.

It is **not** a second active branch id. The main-checkout half's truth remains only in the `activated` column, this column stores
a constant sentinel different from any branch id — storing the id would give the same fact two spellings, and when they drift there is no way to tell which is right.
Therefore **every** site that writes `activated` must also write this column, `activated` and the sentinel must go in and out together.

Hold keys are the third kind of value added by US-314 B1.2, with the corresponding row's `activated` false. Before the main checkout holds a branch,
`WorktreeBranchHeldError.throwIfHeld` runs first: lighting up writes the sentinel, which just overwrites the hold key, so the unique constraint never collides.
Old sentinels can also only be cleared by value — clearing by "non-null" would wipe out hold keys too.

***

### changes$ \{#changes\}

```ts
changes$: RelationEntitiesObservable<typeof RxDBChange>;
```

Defined in: [packages/rxdb/src/system/branch.ts:208](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L208)

Changes

***

### children$ \{#children\}

```ts
children$: RelationEntitiesObservable<typeof RxDBBranch>;
```

Defined in: [packages/rxdb/src/system/branch.ts:218](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L218)

Child branches

***

### createdAt? \{#createdat\}

```ts
createdAt?: Date | null;
```

Defined in: [packages/rxdb/src/system/branch.ts:192](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L192)

Creation time

#### Default

```ts
new Date()
```

***

### fromChangeId? \{#fromchangeid\}

```ts
fromChangeId?: number | null;
```

Defined in: [packages/rxdb/src/system/branch.ts:186](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L186)

Source change ID

***

### id \{#id\}

```ts
id: string;
```

Defined in: [packages/rxdb/src/system/branch.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L143)

id

***

### local \{#local\}

```ts
local: boolean;
```

Defined in: [packages/rxdb/src/system/branch.ts:147](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L147)

Local branch

***

### parent$ \{#parent\}

```ts
parent$: RelationEntityObservable<typeof RxDBBranch>;
```

Defined in: [packages/rxdb/src/system/branch.ts:203](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L203)

Parent branch

***

### parentId? \{#parentid\}

```ts
parentId?: string | null;
```

Defined in: [packages/rxdb/src/system/branch.ts:181](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L181)

Parent branch ID

***

### remote \{#remote\}

```ts
remote: boolean;
```

Defined in: [packages/rxdb/src/system/branch.ts:152](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L152)

Branch already existing online

***

### remove \{#remove\}

```ts
remove: () => Promise<RxDBBranch>;
```

Defined in: [packages/rxdb/src/system/branch.ts:269](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L269)

Delete

#### Returns

`Promise`&lt;`RxDBBranch`&gt;

***

### reset \{#reset\}

```ts
reset: () => void;
```

Defined in: [packages/rxdb/src/system/branch.ts:273](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L273)

Reset data

#### Returns

`void`

***

### save \{#save\}

```ts
save: () => Promise<RxDBBranch>;
```

Defined in: [packages/rxdb/src/system/branch.ts:277](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L277)

Save

#### Returns

`Promise`&lt;`RxDBBranch`&gt;

***

### syncs$ \{#syncs\}

```ts
syncs$: RelationEntitiesObservable<typeof RxDBSync>;
```

Defined in: [packages/rxdb/src/system/branch.ts:213](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L213)

syncs - this branch's Repository sync records

***

### updatedAt? \{#updatedat\}

```ts
updatedAt?: Date | null;
```

Defined in: [packages/rxdb/src/system/branch.ts:198](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L198)

Update time

#### Default

```ts
new Date()
```

***

### \[ENTITY\_STATIC\_TYPES\] \{#entity_static_types\}

```ts
static [ENTITY_STATIC_TYPES]: RxDBBranchStaticTypes;
```

Defined in: [packages/rxdb/src/system/branch.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L139)

***

### count \{#count\}

```ts
static count: (options) => Observable<number>;
```

Defined in: [packages/rxdb/src/system/branch.ts:224](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L224)

count query

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`CountOptions`](../interfaces/CountOptions.md)&lt;*typeof* `RxDBBranch`, [`RxDBBranchRuleGroup`](../type-aliases/RxDBBranchRuleGroup.md)&gt; | Query options |

#### Returns

`Observable`&lt;`number`&gt;

***

### find \{#find\}

```ts
static find: (options) => Observable<RxDBBranch[]>;
```

Defined in: [packages/rxdb/src/system/branch.ts:229](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L229)

find query

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`FindOptions`](../interfaces/FindOptions.md)&lt;*typeof* `RxDBBranch`, [`RxDBBranchRuleGroup`](../type-aliases/RxDBBranchRuleGroup.md), [`RxDBBranchOrderByField`](../type-aliases/RxDBBranchOrderByField.md)&gt; | Query options |

#### Returns

`Observable`&lt;`RxDBBranch`[]&gt;

***

### findAll \{#findall\}

```ts
static findAll: (options) => Observable<RxDBBranch[]>;
```

Defined in: [packages/rxdb/src/system/branch.ts:236](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L236)

findAll query

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`FindAllOptions`](../interfaces/FindAllOptions.md)&lt;*typeof* `RxDBBranch`, [`RxDBBranchRuleGroup`](../type-aliases/RxDBBranchRuleGroup.md), [`RxDBBranchOrderByField`](../type-aliases/RxDBBranchOrderByField.md)&gt; | Query options |

#### Returns

`Observable`&lt;`RxDBBranch`[]&gt;

***

### findByCursor \{#findbycursor\}

```ts
static findByCursor: (options) => Observable<RxDBBranch[]>;
```

Defined in: [packages/rxdb/src/system/branch.ts:243](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L243)

findByCursor query

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`FindByCursorOptions`](../interfaces/FindByCursorOptions.md)&lt;*typeof* `RxDBBranch`, [`RxDBBranchRuleGroup`](../type-aliases/RxDBBranchRuleGroup.md), [`RxDBBranchOrderByField`](../type-aliases/RxDBBranchOrderByField.md)&gt; | Query options |

#### Returns

`Observable`&lt;`RxDBBranch`[]&gt;

***

### findOne \{#findone\}

```ts
static findOne: (options) => Observable<RxDBBranch | null>;
```

Defined in: [packages/rxdb/src/system/branch.ts:250](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L250)

findOne query

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`FindOneOptions`](../interfaces/FindOneOptions.md)&lt;*typeof* `RxDBBranch`, [`RxDBBranchRuleGroup`](../type-aliases/RxDBBranchRuleGroup.md), [`RxDBBranchOrderByField`](../type-aliases/RxDBBranchOrderByField.md)&gt; | Query options |

#### Returns

`Observable`&lt;`RxDBBranch` \| `null`&gt;

***

### findOneOrFail \{#findoneorfail\}

```ts
static findOneOrFail: (options) => Observable<RxDBBranch>;
```

Defined in: [packages/rxdb/src/system/branch.ts:257](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L257)

findOneOrFail query

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`FindOneOrFailOptions`](../interfaces/FindOneOrFailOptions.md)&lt;*typeof* `RxDBBranch`, [`RxDBBranchRuleGroup`](../type-aliases/RxDBBranchRuleGroup.md), [`RxDBBranchOrderByField`](../type-aliases/RxDBBranchOrderByField.md)&gt; | Query options |

#### Returns

`Observable`&lt;`RxDBBranch`&gt;

***

### get \{#get\}

```ts
static get: (options) => Observable<RxDBBranch>;
```

Defined in: [packages/rxdb/src/system/branch.ts:264](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/branch.ts#L264)

get query

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | `string` | Query options |

#### Returns

`Observable`&lt;`RxDBBranch`&gt;
