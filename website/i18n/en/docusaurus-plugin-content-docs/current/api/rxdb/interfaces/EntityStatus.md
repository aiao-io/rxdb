---
sidebar_label: 'EntityStatus⟨T⟩'
---

# EntityStatus`<T>`

Defined in: [packages/rxdb/src/entity/entity-status.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L38)

Entity status manager

Responsibilities:

1. State tracking: local/remote/modified/removed mark the entity's lifecycle state
2. Change recording: records all change history (patches) of the entity, supporting undo/redo
3. Relation management: maintains relation caches between entities, handles cascade operations
4. Change notification: publishes entity change events through RxJS Subjects

Architecture:

- Uses a Proxy to intercept property modifications and record changes automatically
- Relation caches are managed by the EntityRelationCache submodule (including deferred deletion of many-to-many Junctions)
- Lazy-loaded caches (patch/fingerprint), computed on demand to avoid wasted work

## Type Parameters

| Type Parameter                                                                            | Description |
| ----------------------------------------------------------------------------------------- | ----------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) | Entity type |

## Implements

- `IEntityStatus`&lt;`T`&gt;

## Properties

### \_fingerprint? \{#_fingerprint\}

```ts
protected _fingerprint?: string;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:135](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L135)

Entity fingerprint
Used to uniquely identify the entity's version

---

### \_local \{#_local\}

```ts
protected _local: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L103)

Marks whether the entity exists in the local database

---

### \_modified \{#_modified\}

```ts
protected _modified: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L108)

Marks whether the entity has been modified

---

### \_origin \{#_origin\}

```ts
protected _origin: InstanceType<T>;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L129)

The entity's original data
Used to compare changes and to restore

---

### \_patch\_cache? \{#_patch_cache\}

```ts
protected _patch_cache?: Partial<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L123)

Entity change cache

---

### \_patches \{#_patches\}

```ts
protected _patches: EntityPatch<T>[];
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:118](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L118)

Array of entity change records

---

### \_remote \{#_remote\}

```ts
protected _remote: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L98)

Marks whether the entity exists in the remote database

---

### \_removed \{#_removed\}

```ts
protected _removed: boolean = false;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L113)

Marks whether the entity has been deleted

---

### patches$ \{#patches\}

```ts
readonly patches$: Observable<EntityPatch<T>[]>;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:160](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L160)

Observable stream of entity change records
Used to subscribe to entity changes

---

### proxyTarget \{#proxytarget\}

```ts
readonly proxyTarget: InstanceType<T>;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:154](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L154)

The entity proxy object
Used to intercept and record property access and modification on the object

---

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:325](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L325)

The RxDB instance

---

### tableSet \{#tableset\}

```ts
readonly tableSet: WorktreeTableSet;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L148)

The table set mounted on this instance when the entity was created or read (US-314 B2.4).

#### Remarks

Checked against the table set currently mounted on the instance before writing: after a remount, old entity objects cannot write into a different table set (see `WorktreeTableSetMismatchError`).

---

### target \{#target\}

```ts
readonly target: InstanceType<T>;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:140](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L140)

The entity's raw object

#### Implementation of

`IEntityStatus.target`

## Accessors

### fingerprint \{#fingerprint\}

#### Get Signature

```ts
get fingerprint(): string;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:307](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L307)

Entity fingerprint (identifies the content version of **the same reference**)
Format: `${id}@${updatedAt.getTime()}@${content revision number}`

Uses:

- Determines whether the content of the same entity reference has changed (`QueryTask.#next` decides whether to emit based on it)
- Cache key generation
- Conflict detection

##### Remarks

The third segment is a **content revision number** internal to the EntityStatus instance: it increments only when the visible value was really changed (local edits, `reset` undoing real differences, `replace`/`mergeExternal` writing in different values); purely derived cache invalidation (`invalidateCache`, `modified = false` after a save completes, writing back the same value) does not advance it. It exists because the first two segments are insufficient: external incremental backfill **does not guarantee an `updatedAt`** (a `notifyExternalUpdate` patch may contain only business fields, and `QueryManager` even deliberately drops patches that contain "only `updatedAt`"), so under the old format "the value changed but `updatedAt` did not" produced no difference, and live queries stayed on stale values forever.

Therefore this fingerprint can only be compared **along the time axis for the same reference**: the revision number is a per-instance counter, not comparable across different `EntityStatus` instances — two freshly hydrated references are both 0, but their numbers after separate edits are not comparable. To ask "are two references the same version of the same row", compare `id` + `updatedAt`, not the whole fingerprint string.

Lazy-loaded: generated and cached on first access; reading itself does not advance the revision number.

##### Returns

`string`

---

### generation \{#generation\}

#### Get Signature

```ts
get generation(): number;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:269](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L269)

The current generation, incremented once per reset()/replace().
Used by proxy.ts to determine whether a debounce-queued checkChange has expired; see the comment at the #generation declaration.

##### Returns

`number`

---

### inversePatch \{#inversepatch\}

#### Get Signature

```ts
get inversePatch(): Partial<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:254](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L254)

The inverse change content (for undo operations)
Returns the origin values of the properties in the patch

For example: patch = \{ name: 'new' \} → inversePatch = \{ name: 'old' \}

Note: returns `{}` to mean "no real change", never null.

##### Returns

`Partial`&lt;`InstanceType`&lt;`T`&gt;&gt;

---

### local \{#local\}

#### Get Signature

```ts
get local(): boolean;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:206](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L206)

Whether it is local data

##### Returns

`boolean`

#### Set Signature

```ts
set local(value): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:209](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L209)

Whether it is local

##### Parameters

| Parameter | Type      |
| --------- | --------- |
| `value`   | `boolean` |

##### Returns

`void`

#### Implementation of

`IEntityStatus.local`

---

### modified \{#modified\}

#### Get Signature

```ts
get modified(): boolean;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:166](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L166)

Whether the entity has been modified
Marks whether entity properties have changed (compared with origin)

##### Returns

`boolean`

#### Set Signature

```ts
set modified(value): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:178](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L178)

Sets the modification state
Clears caches so the next access to patch/fingerprint recomputes

**Does not advance the content revision number**: this path looks like a "local edit entry point", but it is also how adapters write computed columns from query results back into shared cache entities (`m[prop] = value` → proxy set → here). Advancing it here would make tree queries see their own backfill as "the result changed" and emit again — self-excitation.

##### Parameters

| Parameter | Type      |
| --------- | --------- |
| `value`   | `boolean` |

##### Returns

`void`

#### Implementation of

`IEntityStatus.modified`

---

### origin \{#origin\}

#### Get Signature

```ts
get origin(): InstanceType<T>;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:279](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L279)

##### Returns

`InstanceType`&lt;`T`&gt;

#### Set Signature

```ts
set origin(value): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:276](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L276)

Sets the original value

##### Parameters

| Parameter | Type                      |
| --------- | ------------------------- |
| `value`   | `InstanceType`&lt;`T`&gt; |

##### Returns

`void`

---

### patch \{#patch\}

#### Get Signature

```ts
get patch(): Partial<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:231](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L231)

The current change content (relative to origin)
Returns the set of properties that differ from origin, used to generate database update statements

Optimization: only compares the modified property keys, avoiding a full traversal

Comparison uses `isEqual` deep comparison, keeping the same equality semantics as the Proxy set interception (proxy.ts).
Deep comparison is required: after a successful save, adapters backfill origin with `structuredClone`; reference comparison would leave permanent false diffs on Date / json / array columns, causing every UPDATE to write back repeatedly.

Edge case (inherited from `isEqual`): values with a custom `toString()` are judged by their `toString()` result, not their fields. If a column stores such objects (URL / Error / domain value objects), two instances with the same `toString()` but different fields would be judged "unchanged" → the key does not enter the patch → the write is silently dropped. For such columns, store plain serializable objects, or normalize yourself before assignment.

Note: returns `{}` to mean "no real change" (equal to origin), never null.
The type signature drops `| null`, aligning with runtime behavior.

##### Returns

`Partial`&lt;`InstanceType`&lt;`T`&gt;&gt;

---

### patches \{#patches-1\}

#### Get Signature

```ts
get patches(): EntityPatch<T>[];
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:261](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L261)

Gets the changes

##### Returns

`EntityPatch`&lt;`T`&gt;[]

#### Implementation of

`IEntityStatus.patches`

---

### remote \{#remote\}

#### Get Signature

```ts
get remote(): boolean;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:196](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L196)

Whether it is remote data

##### Returns

`boolean`

#### Set Signature

```ts
set remote(value): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:199](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L199)

Whether it is remote

##### Parameters

| Parameter | Type      |
| --------- | --------- |
| `value`   | `boolean` |

##### Returns

`void`

#### Implementation of

`IEntityStatus.remote`

---

### removed \{#removed\}

#### Get Signature

```ts
get removed(): boolean;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:186](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L186)

Whether it has been deleted

##### Returns

`boolean`

#### Set Signature

```ts
set removed(value): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:189](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L189)

##### Parameters

| Parameter | Type      |
| --------- | --------- |
| `value`   | `boolean` |

##### Returns

`void`

## Methods

### addRelationEntity() \{#addrelationentity\}

```ts
addRelationEntity(relation, entity): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:689](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L689)

Delegates to EntityRelationCache.add — see relation-cache.ts

#### Parameters

| Parameter  | Type                                                                  |
| ---------- | --------------------------------------------------------------------- |
| `relation` | [`EntityRelationMetadata`](../type-aliases/EntityRelationMetadata.md) |
| `entity`   | `any`                                                                 |

#### Returns

`void`

---

### applyExternal() \{#applyexternal\}

```ts
applyExternal(data): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:521](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L521)

Applies a piece of external data, automatically choosing the merge strategy based on whether the entity currently has unsaved edits.

#### Parameters

| Parameter | Type                                       | Description                                                  |
| --------- | ------------------------------------------ | ------------------------------------------------------------ |
| `data`    | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | External data (a whole-row backfill or an incremental patch) |

#### Returns

`void`

#### Remarks

This is the **single** strategy entry point for "external data landing on a cached entity":

- `modified === false`: goes through [replace](#replace), overwriting the whole row and resetting the baseline;
- `modified === true`: goes through [mergeExternal](#mergeexternal), moving the baseline forward while dodging local edits field by field.

It is split out into this method rather than letting each call site decide, because a missed decision fails silently: directly `replace`ing a dirty entity would write the user's unsaved edits into `_origin` and zero out `_modified`, and `patch` would clear along with it — the UI looks unchanged, the next `save()` is a no-op, and the edits are lost forever with no error anywhere. All three paths — query result backfill, cross-tab events, and whole-batch backfill of remote live queries — hit cached entities, and a missed decision in any one of them reproduces the same bug.

This method does **no staleness judgment**. Callers that may receive late events must first intercept with `isStaleEventPayload`.

---

### applyWriteResult() \{#applywriteresult\}

```ts
applyWriteResult(
   row,
   submitted,
   mark
): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:564](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L564)

Cleanup after a successful write: advances the baseline with the row returned by the database, keeping local edits made after the submission as unsaved changes.

#### Parameters

| Parameter   | Type                                       | Description                                                                                                                                 |
| ----------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `row`       | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | The row returned by the database (the new baseline)                                                                                         |
| `submitted` | `object`                                   | The field values submitted by this write: for updates the submitted patch; for creates the whole row at the moment the INSERT was generated |
| `mark`      | `number`                                   | The edit sequence number at submission time, from [writeMark](#writemark)                                                                   |

#### Returns

`void`

#### Remarks

Writes are asynchronous, and the user may keep editing while waiting. Two kinds of local edits are preserved; all other fields take the database-returned values:

- fields changed only after the submission (edit sequence number greater than `mark`);
- fields not in this submission that still differ from the old baseline (when only some fields were submitted, the remaining unsaved edits wait for the next save).
  Preserved fields have patch / `modified` recomputed against the new baseline, and the next `save()` writes them out.

The criterion is "changed after the submission", not "current value equals the submitted value": callers can submit values never written on the instance (e.g. computing a new count incrementally and handing it straight to the repository), in which case the old value on the instance is not a new edit and must not overwrite the value the database just wrote.

Difference from [replace](#replace): `replace` overwrites the whole row and zeroes `modified`, so new input during the wait disappears and the next `save()` is again a no-op. Difference from [mergeExternal](#mergeexternal): the latter always keeps local values for keys still in the patch, so a just-submitted value rewritten by the database (triggers, type normalization) would linger as a false difference forever; here the database wins.

---

### checkChange() \{#checkchange\}

```ts
checkChange(recordAt?): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:592](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L592)

Records an entity change

Mechanism:

1. Computes the current patch and inversePatch
2. Appends the change record to the patches array
3. Publishes the change event through a Subject

Timestamp notes:

- recordAt: business time (Date), used for display and ordering
- timeStamp: performance time (performance.now), used for high-precision timing and ordering

#### Parameters

| Parameter   | Type   | Description                             |
| ----------- | ------ | --------------------------------------- |
| `recordAt?` | `Date` | The change record time; defaults to now |

#### Returns

`void`

---

### checkpoint() \{#checkpoint\}

```ts
checkpoint(): (committed) => void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:374](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L374)

**`Internal`**

Saves the pre-write state of the transaction; on rollback restores the baseline while keeping local edits made during the wait.

#### Returns

The finalizer receiving the commit result; repeated calls have no side effects

(`committed`) => `void`

---

### cleanRelationEntity() \{#cleanrelationentity\}

```ts
cleanRelationEntity(relation): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:699](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L699)

Delegates to EntityRelationCache.clean — see relation-cache.ts

#### Parameters

| Parameter  | Type                                                                  |
| ---------- | --------------------------------------------------------------------- |
| `relation` | [`EntityRelationMetadata`](../type-aliases/EntityRelationMetadata.md) |

#### Returns

`void`

---

### forgetRemovedJunctions() \{#forgetremovedjunctions\}

```ts
forgetRemovedJunctions(junctions): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:670](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L670)

Saved deleted Junctions are no longer pending deletion; delegates to EntityRelationCache.forgetRemovedJunctions.

#### Parameters

| Parameter   | Type                       | Description                        |
| ----------- | -------------------------- | ---------------------------------- |
| `junctions` | `Iterable`&lt;`object`&gt; | The Junctions deleted by this save |

#### Returns

`void`

---

### getNeedRemoveEntities() \{#getneedremoveentities\}

```ts
getNeedRemoveEntities(): object[];
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:655](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L655)

Gets the list of entities that need deletion

Deletion strategy:

- Many-to-many relations: delete the Junction entities (intermediate table records)
- Other relations: associated entities are not deleted automatically (left to the business layer)

Junction entity handling:

1. Added to #remove_junction_set on removeRelationEntity
2. Deleted together on save (guaranteeing transaction consistency)
3. Only local=true ones are deleted (unsaved ones need no deletion)

Design rationale:

- Cascade deletion of ONE_TO_MANY/MANY_TO_ONE is handled by database foreign key constraints
- MANY_TO_MANY has no direct foreign key, so Junctions must be deleted at the application layer

#### Returns

`object`[]

Array of Junction entities pending deletion

---

### getNeedSaveEntities() \{#getneedsaveentities\}

```ts
getNeedSaveEntities(): InstanceType<T>[];
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:624](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L624)

Gets the list of entities that need saving

Logic:

1. Always includes the current entity (this.proxyTarget)
2. Iterates the caches of all relation types
3. Filters out related entities with modified=true
4. Adds child entities from one-to-many sets that were unbound by `remove()` or had their foreign key nulled but not yet persisted

Notes:

- This method only finds directly related entities, without recursion
- Recursive lookup is handled by entity.utils.ts's getNeedSaveEntities
- Returned entities need further filtering (ordered by dependency order)

#### Returns

`InstanceType`&lt;`T`&gt;[]

Array of entities needing saving (includes itself and modified related entities)

---

### getRelationCache() \{#getrelationcache\}

```ts
getRelationCache(relation): Set<any>;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:704](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L704)

Delegates to EntityRelationCache.get — see relation-cache.ts

#### Parameters

| Parameter  | Type                                                                  |
| ---------- | --------------------------------------------------------------------- |
| `relation` | [`EntityRelationMetadata`](../type-aliases/EntityRelationMetadata.md) |

#### Returns

`Set`&lt;`any`&gt;

---

### getRelationObservableEntry() \{#getrelationobservableentry\}

```ts
getRelationObservableEntry(relation): RelationObservableEntry | undefined;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:709](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L709)

Delegates to EntityRelationCache.getObservableEntry — see relation-cache.ts

#### Parameters

| Parameter  | Type                                                                  |
| ---------- | --------------------------------------------------------------------- |
| `relation` | [`EntityRelationMetadata`](../type-aliases/EntityRelationMetadata.md) |

#### Returns

`RelationObservableEntry` \| `undefined`

---

### invalidateCache() \{#invalidatecache\}

```ts
invalidateCache(): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:718](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L718)

#### Returns

`void`

---

### markChanged() \{#markchanged\}

```ts
markChanged(key, value?): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:362](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L362)

Records a property change
Called on Proxy set interception, synchronously recording which properties were modified

#### Parameters

| Parameter | Type                            | Description                                                                   |
| --------- | ------------------------------- | ----------------------------------------------------------------------------- |
| `key`     | keyof `InstanceType`&lt;`T`&gt; | The modified property key                                                     |
| `value?`  | `unknown`                       | The value of this edit; kept until the database backfill overwrites the field |

#### Returns

`void`

---

### markContentChanged() \{#markcontentchanged\}

```ts
markContentChanged(): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:735](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L735)

Declares that "the entity's visible content was just changed by an **external event**", advancing the content revision number (the third segment of [fingerprint](#fingerprint)).

This is the **only** entry point that advances the revision number, and deliberately has exactly one caller: the step where `QueryManager` materializes an external event payload into the cached entity. All value-changing methods ([replace](#replace), [mergeExternal](#mergeexternal), proxy set → `modified = true`) do not advance it, because they double as the paths by which **queries backfill their own results**: adapters write computed columns from SQL (`hasChildren`/`level`/…) back into shared cache entities through exactly these paths, and advancing inside them would make a query see its own backfill as "the result changed" and emit again — self-excitation.

Only the caller knows that "this write came from an external event", so the judgment is left to the caller; the caller is likewise responsible for first confirming that the visible value really changed — unconditional calls cause redundant emissions.

#### Returns

`void`

---

### mergeExternal() \{#mergeexternal\}

```ts
mergeExternal(data): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:479](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L479)

Applies an external update while **dodging local unsaved edits field by field**.

#### Parameters

| Parameter | Type                                       | Description                                 |
| --------- | ------------------------------------------ | ------------------------------------------- |
| `data`    | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | External event payload (incremental fields) |

#### Returns

`void`

#### Remarks

The difference from [replace](#replace) lies in handling "dirty entities": `replace` does `Object.assign` onto target, resets `_origin` and zeroes `_modified` — the user's unsaved edits get written into the baseline, the patch clears, the UI looks unchanged, and the next `save()` silently no-ops, losing the edits forever.

The semantics here:

- the `_origin` baseline **always moves forward** to the external values (undo should return to the state after the external advance, not an earlier stale value);
- keys still holding real differences in the current patch **keep local values**, not overwritten by external ones;
- all remaining keys sync to the external values.

`patch` is then recomputed as "current value vs new baseline", so it naturally converges to empty when the external value happens to equal the local edit (nothing left to write); `_modified` is recomputed the same way, not unconditionally zeroed.

---

### removeRelationEntity() \{#removerelationentity\}

```ts
removeRelationEntity(relation, entity): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:694](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L694)

Delegates to EntityRelationCache.remove — see relation-cache.ts

#### Parameters

| Parameter  | Type                                                                  |
| ---------- | --------------------------------------------------------------------- |
| `relation` | [`EntityRelationMetadata`](../type-aliases/EntityRelationMetadata.md) |
| `entity`   | `any`                                                                 |

#### Returns

`void`

---

### replace() \{#replace\}

```ts
replace(data): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:442](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L442)

Re-syncs the current entity reference with external data
Used for safe backfill after a query cache hit, avoiding mis-recording user modifications through the Proxy.

Note: the local _removed flag is not cleared, so cache backfill does not "resurrect" entities already marked deleted.
The state of a user-initiated delete must not be overwritten by remote cache backfill.

#### Parameters

| Parameter | Type                                       |
| --------- | ------------------------------------------ |
| `data`    | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; |

#### Returns

`void`

---

### reset() \{#reset\}

```ts
reset(): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:419](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L419)

Resets the entity state to the initial state (origin)

Operations:

1. Deletes keys on proxyTarget that origin lacks (in the `createEntityRef` sparse-hydration scenario, properties added only after construction never existed in origin, and `Object.assign` alone cannot remove them)
2. Restores all properties of proxyTarget to origin's values
3. Clears the modified flag
4. Clears the change history (patches)
5. Increments generation, invalidating previously queued but not-yet-fired debounced checkChange (see the #generation comment)
6. Publishes an empty change event

Use case: undo all unsaved modifications

#### Returns

`void`

---

### setRelationObservableEntry() \{#setrelationobservableentry\}

```ts
setRelationObservableEntry(relation, entry): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:714](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L714)

Delegates to EntityRelationCache.setObservableEntry — see relation-cache.ts

#### Parameters

| Parameter  | Type                                                                  |
| ---------- | --------------------------------------------------------------------- |
| `relation` | [`EntityRelationMetadata`](../type-aliases/EntityRelationMetadata.md) |
| `entry`    | `RelationObservableEntry`                                             |

#### Returns

`void`

---

### writeMark() \{#writemark\}

```ts
writeMark(submitted): number;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:540](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L540)

Takes the edit sequence number at the moment of write submission; handed together with the submitted values to [applyWriteResult](#applywriteresult) after the write succeeds.

#### Parameters

| Parameter   | Type     | Description                         |
| ----------- | -------- | ----------------------------------- |
| `submitted` | `object` | The field values of this submission |

#### Returns

`number`

When `submitted` is exactly the object previously taken from [patch](#patch), returns the sequence number from the moment it was computed; otherwise returns the current sequence number

#### Remarks

`EntityManager.update` takes the patch before calling the repository, and the write may sit in the transaction queue for a while; recognizing the moment this patch was computed means edits during the queue wait also count as "after submission" and are not overwritten by backfill. Submission values assembled by the caller (not the object taken from `patch`) count from the moment of this call.
