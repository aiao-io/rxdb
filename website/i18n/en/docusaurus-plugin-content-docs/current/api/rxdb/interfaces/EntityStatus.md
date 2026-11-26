---
sidebar_label: 'EntityStatus⟨T⟩'
---

# EntityStatus`<T>`

Defined in: [packages/rxdb/src/entity/entity-status.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L38)

Entity status manager

Responsibilities:

1. State tracking: local/remote/modified/removed mark the lifecycle state of the entity
2. Change recording: records all change history (patches) of the entity, supporting undo/redo
3. Relation management: maintains relation caches between entities, handling cascade operations
4. Change notification: publishes entity change events through RxJS Subjects

Architecture:

- Uses a Proxy to intercept property modifications and record changes automatically
- Relation caches are managed by the EntityRelationCache submodule (including lazy many-to-many Junction deletion)
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
Used to uniquely identify the version of an entity

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

The original data of the entity
Used for comparing changes and restoring

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

Entity change record array

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

RxDB instance

---

### tableSet \{#tableset\}

```ts
readonly tableSet: WorktreeTableSet;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L148)

The table set this instance was mounted on when this entity was created or read (US-314 B2.4).

#### Remarks

Checked against the table set the instance is currently mounted on before writing: after a remount, an old entity object cannot be written into a different table set (see `WorktreeTableSetMismatchError`).

---

### target \{#target\}

```ts
readonly target: InstanceType<T>;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:140](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L140)

The original entity object

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
Format: `${id}@${updatedAt.getTime()}@${content revision}`

Uses:

- Judging whether the content of the same entity reference has been changed (`QueryTask.#next` decides whether to emit based on it)
- Cache key generation
- Conflict detection

##### Remarks

The third segment is the **content revision** internal to the EntityStatus instance: it increments only when the visible value really changed
(local edits, `reset` undoing a real difference, `replace`/`mergeExternal` writing different values);
pure derived-cache invalidation (`invalidateCache`, `modified = false` after a save completes, writing back the same value) does not advance it.
It exists because the first two segments are not enough:
external incremental backfills do **not guarantee `updatedAt`** (the patch of `notifyExternalUpdate` may carry only business fields,
and `QueryManager` deliberately drops patches that only have `updatedAt`), so "value changed but `updatedAt` did not"
could not be detected under the old format, and live queries would stay on the old value forever.

Therefore this fingerprint can only be compared **along the time axis for the same reference**: the revision is a per-instance counter, and different `EntityStatus`
instances are not comparable — two freshly hydrated references are both 0, but the numbers after each is edited are not comparable.
To ask "are two references the same version of the same row", compare `id` + `updatedAt`, not the whole fingerprint string.

Lazy-loaded: generated and cached on first access; reading itself does not advance the revision.

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
Used by proxy.ts to judge whether a debounced, queued checkChange has gone stale; see the comment at the #generation declaration.

##### Returns

`number`

---

### inversePatch \{#inversepatch\}

#### Get Signature

```ts
get inversePatch(): Partial<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:254](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L254)

Reverse change content (used for undo operations)
Returns the property values in origin corresponding to the patch

For example: patch = \{ name: 'new' \} → inversePatch = \{ name: 'old' \}

Note: returns `{}` to mean "no real change", not null.

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
Marks whether the entity's properties have changed (compared with origin)

##### Returns

`boolean`

#### Set Signature

```ts
set modified(value): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:178](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L178)

Sets the modified state
Clears caches so the next access to patch/fingerprint recomputes

**Does not advance the content revision**: this path looks like a "local edit entry", but in fact the adapter
writing the computed columns of a query back to a shared cache entity also goes through it (`m[prop] = value` → proxy set → here).
Advancing here would make tree queries see their own backfill as "the result changed" and emit once more — self-excitation.

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

The comparison uses `isEqual` deep comparison, keeping the same equality semantics as the Proxy set interception (proxy.ts).
Deep comparison is required: after a successful save the adapter backfills origin with a `structuredClone`,
and reference comparison would leave Date / json / array columns with permanent fake diffs, causing repeated write-backs on every UPDATE.

Edge (inherited from `isEqual`): values with a custom `toString()` are judged by the `toString()` result,
ignoring fields. If a column stores such objects (URL / Error / domain value objects), two instances with the same `toString()`
but different fields would be judged as "unchanged" → the key does not enter the patch → the write is silently dropped.
For such columns, store serializable plain objects, or normalize before assignment.

Note: returns `{}` to mean "no real change" (equal to origin), not null.
The type signature drops `| null`, aligned with the runtime behavior.

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

Whether it is on the remote

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

| Parameter | Type                                       | Description                                                                |
| --------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| `data`    | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | External data (a whole-row backfill or an incremental patch are both fine) |

#### Returns

`void`

#### Remarks

This is the **only** strategy entry for "external data landing on a cached entity":

- `modified === false`: goes through [replace](#replace), overwriting the whole row and resetting the baseline;
- `modified === true`: goes through [mergeExternal](#mergeexternal), moving the baseline forward but yielding to local edits field by field.

It is factored out rather than judged at each call site because the consequence of a missed judgment is silent: directly `replace`ing a dirty entity
would write the user's unsaved edits into `_origin` and zero `_modified`, clearing `patch` along with it — the UI looks
unchanged, the next `save()` is a no-op, and the edits are lost forever with no error anywhere. Query result backfills, cross-tab events,
and remote live-query batch backfills all hit cached entities, and one missed judgment on any of the three paths reproduces the same bug.

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

The wrap-up after a successful write: advances the baseline with the row returned by the database, and keeps local edits made after the submission as unsaved changes.

#### Parameters

| Parameter   | Type                                       | Description                                                                                                                                     |
| ----------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `row`       | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | The row returned by the database (the new baseline)                                                                                             |
| `submitted` | `object`                                   | The field values submitted by this write: for an update the submitted patch, for a create the entire row at the moment the INSERT was generated |
| `mark`      | `number`                                   | The edit sequence number at submission, taken from [writeMark](#writemark)                                                                      |

#### Returns

`void`

#### Remarks

Writes are asynchronous, and the user may keep editing while waiting. Two kinds of local edits are kept; all other fields take the values returned by the database:

- fields changed after the submission (edit sequence number greater than `mark`);
- fields not in this submission that still differ from the old baseline (when only some fields were submitted, the remaining unsaved edits wait for the next save).
  Kept fields recompute patch / `modified` against the new baseline, and the next `save()` writes them out.

The criterion is "changed after the submission" rather than "current value differs from the submitted value": callers may submit values that were never written on the instance
(for example handing the repository a newly computed count derived from increments), in which case the instance's old value is not a new edit and must not overwrite the value the database just wrote.

The difference from [replace](#replace): `replace` overwrites the whole row and zeros `modified`, so new input during the wait disappears,
and the next `save()` is still a no-op. The difference from [mergeExternal](#mergeexternal): the latter always keeps local values for keys still in patch,
so a just-submitted value rewritten by the database (triggers, type normalization) would linger as a fake diff; here the database wins.

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
3. Publishes the change event through the Subject

Timestamp notes:

- recordAt: business time (Date), used for display and ordering
- timeStamp: performance time (performance.now), used for high-precision timing and ordering

#### Parameters

| Parameter   | Type   | Description                                      |
| ----------- | ------ | ------------------------------------------------ |
| `recordAt?` | `Date` | Change record time, defaults to the current time |

#### Returns

`void`

---

### checkpoint() \{#checkpoint\}

```ts
checkpoint(): (committed) => void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:374](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L374)

**`Internal`**

Saves the state before a transactional write; on rollback restores the baseline and keeps the local edits made while waiting.

#### Returns

A wrap-up function that takes the commit result; repeated calls have no side effect

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

Junctions deleted by a save are no longer pending deletion; delegates to EntityRelationCache.forgetRemovedJunctions.

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

Gets the list of entities to remove

Removal strategy:

- Many-to-many relations: remove Junction entities (join table records)
- Other relations: related entities are not removed automatically (decided by the business layer)

Junction entity handling:

1. Added to #remove_junction_set on removeRelationEntity
2. Deleted together on save (guaranteeing transactional consistency)
3. Only local=true ones are deleted (unsaved ones need no deletion)

Design rationale:

- ONE_TO_MANY/MANY_TO_ONE cascade deletion is handled by database foreign key constraints
- MANY_TO_MANY has no direct foreign key, so the application layer must delete the Junctions

#### Returns

`object`[]

The array of Junction entities pending deletion

---

### getNeedSaveEntities() \{#getneedsaveentities\}

```ts
getNeedSaveEntities(): InstanceType<T>[];
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:624](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L624)

Gets the list of entities to save

Logic:

1. Always includes the current entity (this.proxyTarget)
2. Traverses the caches of all relation types
3. Picks out related entities with modified=true
4. Adds the child entities of one-to-many collections whose `remove()` unbound them and whose foreign keys are set to null but not yet persisted

Notes:

- This method only looks up directly related entities, no recursion
- Recursive lookup is handled by getNeedSaveEntities in entity.utils.ts
- The returned entities need further filtering (ordering by dependency)

#### Returns

`InstanceType`&lt;`T`&gt;[]

The array of entities to save (including itself and modified related entities)

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
| `key`     | keyof `InstanceType`&lt;`T`&gt; | The key of the modified property                                              |
| `value?`  | `unknown`                       | The value of this edit; kept until the database backfill overwrites the field |

#### Returns

`void`

---

### markContentChanged() \{#markcontentchanged\}

```ts
markContentChanged(): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:735](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L735)

Declares that "the entity's visible content has just been changed by an **external event**", advancing the content revision (the third segment of [fingerprint](#fingerprint)).

This is the **only** entry that advances the revision, and deliberately has exactly one caller: the step where `QueryManager` materializes
external event payloads into cached entities. None of the value-changing methods ([replace](#replace), [mergeExternal](#mergeexternal),
proxy set → `modified = true`) advance it, because they are at the same time the paths by which **queries backfill their own results**:
the adapter writing the computed columns a query computed in SQL (`hasChildren`/`level`/…) back to a shared cache entity goes through exactly
these paths, and advancing inside them would make the query see its own backfill as "the result changed" and emit once more — self-excitation.

Whether "this write came from an external event" is known only to the caller, so the judgment is left to the caller;
the caller is equally responsible for first confirming that the visible value really changed — calling unconditionally causes superfluous emissions.

#### Returns

`void`

---

### mergeExternal() \{#mergeexternal\}

```ts
mergeExternal(data): void;
```

Defined in: [packages/rxdb/src/entity/entity-status.ts:479](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-status.ts#L479)

Applies an external update, but **yields field by field** to local unsaved edits.

#### Parameters

| Parameter | Type                                       | Description                                     |
| --------- | ------------------------------------------ | ----------------------------------------------- |
| `data`    | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | The external event payload (incremental fields) |

#### Returns

`void`

#### Remarks

The difference from [replace](#replace) is the handling of "dirty entities": `replace` does `Object.assign` onto target
and resets `_origin`, zeroing `_modified` — the user's unsaved edits are written into the baseline along with it and the patch is cleared,
the UI looks unchanged, yet the next `save()` silently no-ops and the edits are lost forever.

The semantics here are:

- the `_origin` baseline **always moves forward** to the external value (undo should return to the state after the external push, not an earlier stale value);
- keys that still have real differences in the current patch **keep the local value** and are not overwritten by the external value;
- all other keys sync to the external value.

`patch` is then recomputed as "current value vs new baseline", so when the external value happens to equal the local edit it naturally converges to empty
(indeed nothing needs to be written); `_modified` is also recomputed from this, rather than unconditionally zeroed.

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

Note: the local _removed flag is not cleared, avoiding a cache backfill "reviving" an entity already marked as deleted.
A state where the user has actively marked deletion should not be overwritten by a remote cache backfill.

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

1. Deletes keys on proxyTarget that origin does not have ( ：in the `createEntityRef` sparse hydration scenario,
   properties added after construction never existed in origin, and Object.assign alone cannot clear them)
2. Restores all properties of proxyTarget to the values in origin
3. Clears the modified flag
4. Clears the change history (patches)
5. Increments generation, invalidating debounced checkChanges queued but not yet fired (see the #generation comment)
6. Publishes an empty change event

Use case: undoing all unsaved modifications

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

The edit sequence number at the moment of submission; handed to [applyWriteResult](#applywriteresult) together with the submitted values after a successful write.

#### Parameters

| Parameter   | Type     | Description                         |
| ----------- | -------- | ----------------------------------- |
| `submitted` | `object` | The field values of this submission |

#### Returns

`number`

When `submitted` is exactly the object previously taken from [patch](#patch), returns the sequence number at the moment it was computed; otherwise returns the current sequence number

#### Remarks

`EntityManager.update` takes the patch before calling the repository, and the write may still queue in the transaction queue for a while;
recognizing the moment this patch was computed means edits made while queued also count as "after the submission" and are not overwritten by the backfill.
A submission value assembled by the caller itself (not the object taken from `patch`) counts from the moment of this call.
