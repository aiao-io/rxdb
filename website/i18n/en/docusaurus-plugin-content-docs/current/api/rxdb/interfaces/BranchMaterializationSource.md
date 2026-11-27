# BranchMaterializationSource

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L111)

Remote snapshot source: the only seam between the working tree materialization pipeline and business data.

## Remarks

The members correspond to the questions the pipeline cannot answer from the working tree: **up to where to pull** (the intent comes from the remote cursor), **what the content is**
(the paging protocol is the sync layer's business), **whether the local configuration changed after freezing**, **how one page becomes a projection** (the working tree
does not know business entities), and **where the sync watermark lands after materialization**. Everything else — page ordering, fingerprint re-verification, continuation judgment,
the writes and switch inside the barrier — lives in the working tree, out of the source's reach.

Registered by the official sync plugin at assembly time through [RxDB.branchMaterializationSource](../classes/RxDB.md#branchmaterializationsource), **at most one** per connection:
two sources mean the same branch can be materialized once by each of two snapshots that do not know each other, and the second would see the scene
already produced by the first.

## Methods

### freezeIntent() \{#freezeintent\}

```ts
freezeIntent(targetBranchId): Promise<BranchMaterializationIntent>;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L121)

Freezes the intent of this materialization.

#### Parameters

| Parameter        | Type     | Description                                |
| ---------------- | -------- | ------------------------------------------ |
| `targetBranchId` | `string` | The id of the target branch to materialize |

#### Returns

`Promise`&lt;[`BranchMaterializationIntent`](BranchMaterializationIntent.md)&gt;

See [BranchMaterializationIntent](BranchMaterializationIntent.md)

#### Remarks

Runs **outside any transaction**: it must ask the remote, and network I/O holding a write transaction would lock the whole database until timeout.

---

### pages() \{#pages\}

```ts
pages(request): AsyncIterable<BranchMaterializationPagePayload>;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L136)

Hands out this snapshot page by page.

#### Parameters

| Parameter | Type                                                                      | Description                                                                 |
| --------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `request` | [`BranchMaterializationPageRequest`](BranchMaterializationPageRequest.md) | See [BranchMaterializationPageRequest](BranchMaterializationPageRequest.md) |

#### Returns

`AsyncIterable`&lt;[`BranchMaterializationPagePayload`](BranchMaterializationPagePayload.md)&gt;

The async sequence starting from the `fromPageIndex` page; stops when done giving

#### Remarks

Made an `AsyncIterable` rather than one array at a time: the whole snapshot may be hundreds of thousands of rows, and holding it all in memory
would cancel out FR-044's page-by-page persistence. Each page is one request behind the scenes, hence the async sequence.

**Each page is persisted by the working tree in its own transaction**, so when the sequence throws on page N, the first N pages are already in the database
— the next switch continues pulling from page N.

---

### projectPage() \{#projectpage\}

```ts
projectPage(context): Promise<SwitchVersionActions<EntityType>>;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:160](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L160)

Projects one snapshot page into local write operations.

#### Parameters

| Parameter | Type                                                                                  | Description                                                                             |
| --------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `context` | [`BranchMaterializationProjectionContext`](BranchMaterializationProjectionContext.md) | See [BranchMaterializationProjectionContext](BranchMaterializationProjectionContext.md) |

#### Returns

`Promise`&lt;[`SwitchVersionActions`](SwitchVersionActions.md)&lt;[`EntityType`](../type-aliases/EntityType.md)&gt;&gt;

The inserts/updates/deletes of this page to land on the entity tables

#### Remarks

Runs **inside the barrier transaction**, called page by page in page order; computes only, never writes — writes are persisted uniformly by the working tree through its trusted call sites,
so the source never needs another ticket for a trusted entry just for the writes inside the barrier.

---

### resolveIntentDrift() \{#resolveintentdrift\}

```ts
resolveIntentDrift(context): Promise<string | undefined>;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L148)

Judges whether the local sync configuration has drifted since the freeze.

#### Parameters

| Parameter | Type                                                                            | Description                                                                       |
| --------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `context` | [`BranchMaterializationBarrierContext`](BranchMaterializationBarrierContext.md) | See [BranchMaterializationBarrierContext](BranchMaterializationBarrierContext.md) |

#### Returns

`Promise`&lt;`string` \| `undefined`&gt;

A readable reason when drifted; `undefined` when not drifted

#### Remarks

Called once before continuing an old staging and once at the barrier re-verification, both read-only against local state and **never asking the remote**:
the barrier holds a write transaction. A drifted staging cannot be projected — it was pulled under a different scope or filter conditions.

---

### settle() \{#settle\}

```ts
settle(context): Promise<void>;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L171)

Settles the source's own state inside the barrier (for example the sync watermark of the target branch).

#### Parameters

| Parameter | Type                                                                            | Description                                                                       |
| --------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `context` | [`BranchMaterializationBarrierContext`](BranchMaterializationBarrierContext.md) | See [BranchMaterializationBarrierContext](BranchMaterializationBarrierContext.md) |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Same transaction as the projection: if the watermark lands before the data, the next pull skips the segment of changes that never landed;
if the data lands before the watermark, the next pull re-pulls the whole snapshot.
