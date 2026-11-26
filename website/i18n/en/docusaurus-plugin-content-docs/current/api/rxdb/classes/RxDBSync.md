# RxDBSync

Defined in: [packages/rxdb/src/system/sync.ts:126](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L126)

Repository sync metadata table

Tracks the sync state of every repository on every branch, including:

- Sync type (full/remote/local/none)
- Last push/pull time
- Last pushed/pulled changeId
- The remote identity the cursor belongs to
- Whether sync is enabled

## Constructors

### Constructor

```ts
new RxDBSync(): RxDBSync;
```

#### Returns

`RxDBSync`

## Properties

### branch? \{#branch\}

```ts
branch?: RxDBBranch;
```

Defined in: [packages/rxdb/src/system/sync.ts:210](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L210)

The related branch

---

### branchId \{#branchid\}

```ts
branchId: string;
```

Defined in: [packages/rxdb/src/system/sync.ts:149](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L149)

The ID of the branch it belongs to

---

### createdAt \{#createdat\}

```ts
createdAt: Date;
```

Defined in: [packages/rxdb/src/system/sync.ts:200](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L200)

Creation time

---

### enabled \{#enabled\}

```ts
enabled: boolean;
```

Defined in: [packages/rxdb/src/system/sync.ts:195](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L195)

Whether sync is enabled (the manual disable switch)

---

### entity \{#entity\}

```ts
entity: string;
```

Defined in: [packages/rxdb/src/system/sync.ts:144](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L144)

Entity name

#### Example

```ts
'Todo';
```

---

### id \{#id\}

```ts
id: string;
```

Defined in: [packages/rxdb/src/system/sync.ts:132](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L132)

Primary key ID
Format: \{namespace\}:\{entity\}:\{branchId\}

#### Example

```ts
'public:Todo:main';
```

---

### lastPulledAt \{#lastpulledat\}

```ts
lastPulledAt: Date | null;
```

Defined in: [packages/rxdb/src/system/sync.ts:175](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L175)

Last pull time

---

### lastPullRemoteChangeId \{#lastpullremotechangeid\}

```ts
lastPullRemoteChangeId: number | null;
```

Defined in: [packages/rxdb/src/system/sync.ts:180](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L180)

The last pulled remote changeId

---

### lastPushedAt \{#lastpushedat\}

```ts
lastPushedAt: Date | null;
```

Defined in: [packages/rxdb/src/system/sync.ts:170](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L170)

Last push time

---

### lastPushedChangeId \{#lastpushedchangeid\}

```ts
lastPushedChangeId: number | null;
```

Defined in: [packages/rxdb/src/system/sync.ts:165](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L165)

The last pushed local changeId

---

### namespace \{#namespace\}

```ts
namespace: string;
```

Defined in: [packages/rxdb/src/system/sync.ts:138](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L138)

Entity namespace

#### Example

```ts
'public';
```

---

### remoteBackendId \{#remotebackendid\}

```ts
remoteBackendId: string | null;
```

Defined in: [packages/rxdb/src/system/sync.ts:190](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L190)

The remote identity this row's cursor belongs to (the return value of `RxDBAdapterRemoteBase.backendId()`)

#### Remarks

Remote change ids are only monotonic within the same remote database: after the remote is rebuilt, ids start counting from scratch and an old cursor would skip past
all of the new database's ids, making pulls silently come up empty. The cursor is only valid on the remote recorded in this column, and the sync entrance refuses to continue
when it finds the remote identity has changed. `null` means not yet bound (rows written before system schema 9, or never exchanged data with the remote), bound on the first sync.

---

### remove \{#remove\}

```ts
remove: () => Promise<RxDBSync>;
```

Defined in: [packages/rxdb/src/system/sync.ts:238](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L238)

Delete

#### Returns

`Promise`&lt;`RxDBSync`&gt;

---

### reset \{#reset\}

```ts
reset: () => void;
```

Defined in: [packages/rxdb/src/system/sync.ts:242](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L242)

Reset data

#### Returns

`void`

---

### save \{#save\}

```ts
save: () => Promise<RxDBSync>;
```

Defined in: [packages/rxdb/src/system/sync.ts:246](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L246)

Save

#### Returns

`Promise`&lt;`RxDBSync`&gt;

---

### syncType \{#synctype\}

```ts
syncType: 'local' | 'remote' | 'filter' | 'full' | 'querycache' | 'none';
```

Defined in: [packages/rxdb/src/system/sync.ts:160](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L160)

Sync type

- full: local ↔ remote full sync
- filter: local ↔ remote filtered sync (only syncs data matching the conditions)
- querycache: query cache sync (maintains consistency between the local cache and remote data by query result sets)
- remote: read-only remote data (pull only, no push)
- local: local only (push only, no pull)
- none: no sync (system tables or temporary data)

---

### updatedAt \{#updatedat\}

```ts
updatedAt: Date;
```

Defined in: [packages/rxdb/src/system/sync.ts:205](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L205)

Update time

---

### count \{#count\}

```ts
static count: (options) => Observable<number>;
```

Defined in: [packages/rxdb/src/system/sync.ts:233](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L233)

#### Parameters

| Parameter | Type                                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `options` | [`CountOptions`](../interfaces/CountOptions.md)&lt;_typeof_ `RxDBSync`, [`RxDBSyncRuleGroup`](../type-aliases/RxDBSyncRuleGroup.md)&gt; |

#### Returns

`Observable`&lt;`number`&gt;

---

### find \{#find\}

```ts
static find: (options) => Observable<RxDBSync[]>;
```

Defined in: [packages/rxdb/src/system/sync.ts:213](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L213)

#### Parameters

| Parameter | Type                                                                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options` | [`FindOptions`](../interfaces/FindOptions.md)&lt;_typeof_ `RxDBSync`, [`RxDBSyncRuleGroup`](../type-aliases/RxDBSyncRuleGroup.md), [`RxDBSyncOrderByField`](../type-aliases/RxDBSyncOrderByField.md)&gt; |

#### Returns

`Observable`&lt;`RxDBSync`[]&gt;

---

### findAll \{#findall\}

```ts
static findAll: (options) => Observable<RxDBSync[]>;
```

Defined in: [packages/rxdb/src/system/sync.ts:217](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L217)

#### Parameters

| Parameter | Type                                                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options` | [`FindAllOptions`](../interfaces/FindAllOptions.md)&lt;_typeof_ `RxDBSync`, [`RxDBSyncRuleGroup`](../type-aliases/RxDBSyncRuleGroup.md), [`RxDBSyncOrderByField`](../type-aliases/RxDBSyncOrderByField.md)&gt; |

#### Returns

`Observable`&lt;`RxDBSync`[]&gt;

---

### findByCursor \{#findbycursor\}

```ts
static findByCursor: (options) => Observable<RxDBSync[]>;
```

Defined in: [packages/rxdb/src/system/sync.ts:229](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L229)

#### Parameters

| Parameter | Type                                                                                                                                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `options` | [`FindByCursorOptions`](../interfaces/FindByCursorOptions.md)&lt;_typeof_ `RxDBSync`, [`RxDBSyncRuleGroup`](../type-aliases/RxDBSyncRuleGroup.md), [`RxDBSyncOrderByField`](../type-aliases/RxDBSyncOrderByField.md)&gt; |

#### Returns

`Observable`&lt;`RxDBSync`[]&gt;

---

### findOne \{#findone\}

```ts
static findOne: (options) => Observable<RxDBSync | null>;
```

Defined in: [packages/rxdb/src/system/sync.ts:221](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L221)

#### Parameters

| Parameter | Type                                                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options` | [`FindOneOptions`](../interfaces/FindOneOptions.md)&lt;_typeof_ `RxDBSync`, [`RxDBSyncRuleGroup`](../type-aliases/RxDBSyncRuleGroup.md), [`RxDBSyncOrderByField`](../type-aliases/RxDBSyncOrderByField.md)&gt; |

#### Returns

`Observable`&lt;`RxDBSync` \| `null`&gt;

---

### findOneOrFail \{#findoneorfail\}

```ts
static findOneOrFail: (options) => Observable<RxDBSync>;
```

Defined in: [packages/rxdb/src/system/sync.ts:225](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/sync.ts#L225)

#### Parameters

| Parameter | Type                                                                                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options` | [`FindOneOrFailOptions`](../interfaces/FindOneOrFailOptions.md)&lt;_typeof_ `RxDBSync`, [`RxDBSyncRuleGroup`](../type-aliases/RxDBSyncRuleGroup.md), [`RxDBSyncOrderByField`](../type-aliases/RxDBSyncOrderByField.md)&gt; |

#### Returns

`Observable`&lt;`RxDBSync`&gt;
