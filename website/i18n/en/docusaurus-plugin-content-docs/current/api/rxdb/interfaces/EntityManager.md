# EntityManager

Defined in: [packages/rxdb/src/entity/entity-manager.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L88)

Entity manager.

Responsible for managing the whole lifecycle of entities, including:
1. Entity creation, update, and deletion
2. Entity cache management
3. Entity relation handling
4. Entity repository access
5. Entity proxies and change tracking

The entity manager is the bridge connecting entities, repositories, and the database;
it keeps entity states consistent and handles the relations between entities.

## Properties

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L125)

The RxDB instance, providing database access and event dispatch.

## Methods

### addEntityCache() \{#addentitycache\}

```ts
addEntityCache<T>(entity): void;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:387](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L387)

Adds an entity to the cache.
Adds the entity instance to the cache map of the corresponding type.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | Entity type |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The entity instance to cache |

#### Returns

`void`

#### Remarks

Entities whose primary key has no value yet are **not cached**: the identity cache is indexed by id, and at
this moment it has no identity to index. It used to write them in anyway, so all id-less entities shared the
single `undefined` slot, and `getEntityRef(T, undefined)` would return a random one of them — sparse hydration
then updated based on that, changing a different record. When the primary key is assigned later,
[reindexEntityCache](#reindexentitycache) registers it (triggered by the Proxy set interception), so nothing
is missed.

***

### cleanAllCache() \{#cleanallcache\}

```ts
cleanAllCache(): void;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:261](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L261)

Clears all caches.

#### Returns

`void`

#### Remarks

Destroys repositories one by one in isolation: one repository's `destroy()` throwing must neither let the
remaining repositories go undestroyed nor let the cache clearing itself be skipped. The first exception is
kept and thrown uniformly after the clearing finishes, so the caller still sees the original error.

***

### create() \{#create\}

```ts
create<T>(data): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:581](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L581)

Creates an entity.
Creates a new entity in the database and dispatches the related events.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-1"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | Entity type |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `data` | `InstanceType`&lt;`T`&gt; | The entity instance to create |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity instance after creation.

#### Throws

Throws if creation fails.

***

### createEntityRef() \{#createentityref\}

```ts
createEntityRef<T>(
   EntityType, 
   data, 
   status?
): EntityInstanceType<T>;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:324](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L324)

Creates an entity reference.
Creates or obtains an entity instance from the provided data, and sets its state.
If the entity already exists in the cache, returns the cached instance.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-2"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | Entity type |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | Entity type |
| `data` | [`EntityUpdateData`](../type-aliases/EntityUpdateData.md)&lt;`T`&gt; | Entity data; must include the id |
| `status?` | `EntityStatusOptions`&lt;`T`&gt; | Optional entity state configuration |

#### Returns

[`EntityInstanceType`](../type-aliases/EntityInstanceType.md)&lt;`T`&gt;

The created or obtained entity instance.

***

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:288](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L288)

Destroys the manager and unbinds the entity classes.

#### Returns

`void`

#### Remarks

Unbinding is placed in a finally block: even if [EntityManager.cleanAllCache](#cleanallcache) throws because
some repository failed to destroy, the entity classes must still be unbound from this manager, otherwise the
next database reusing the same entity class gets wrongly blocked by "registered with multiple RxDB instances".
The original error is rethrown as-is after unbinding completes.

The unbind targets are the entity classes actually bound at `init()`, not the current `config.entities`:
entities a plugin removes when its scope is released must be unbound too, otherwise the entity class stays
permanently bound to a torn-down instance.

***

### getEntityRef() \{#getentityref\}

```ts
getEntityRef<T>(EntityType, id): 
  | EntityInstanceType<T>
  | undefined;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:354](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L354)

Gets an entity reference.
Gets the entity instance with the given ID from the cache.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-3"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | Entity type |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | Entity type |
| `id` | [`EntityStaticType`](../type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | Entity ID |

#### Returns

  \| [`EntityInstanceType`](../type-aliases/EntityInstanceType.md)&lt;`T`&gt;
  \| `undefined`

The entity instance, or undefined if it does not exist.

***

### getRepository() \{#getrepository\}

```ts
getRepository<T, RT>(EntityType): RT;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:678](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L678)

Gets the entity repository.
Gets the repository instance of the given entity type.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-4"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | Entity type |
| <a id="type-parameter-rt"></a> `RT` *extends* [`Repository`](../classes/Repository.md)&lt;`T`, [`IRepository`](IRepository.md)&lt;`T`&gt;&gt; | - |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | Entity type |

#### Returns

`RT`

The entity repository instance.

***

### hasEntityRef() \{#hasentityref\}

```ts
hasEntityRef<T>(EntityType, id): boolean;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:370](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L370)

Checks whether an entity is in the cache.
Determines whether the entity with the given ID has been initialized in the cache.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-5"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | Entity type |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | Entity type |
| `id` | [`EntityStaticType`](../type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | Entity ID |

#### Returns

`boolean`

Returns true if the entity exists in the cache.

***

### init() \{#init\}

```ts
init(): void;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L129)

#### Returns

`void`

***

### instantiate() \{#instantiate\}

```ts
instantiate<T>(EntityType, initData?): InstanceType<T>;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:306](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L306)

Constructs an entity in the current database context.
When multiple databases share one Entity class, a direct `new Entity()` cannot tell which database is the
target; use this method to preserve the entity constructor's defaults and custom initialization logic.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-6"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `EntityType` | `T` |
| `initData?` | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; |

#### Returns

`InstanceType`&lt;`T`&gt;

***

### mutations() \{#mutations\}

```ts
mutations<T>(options): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:508](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L508)

Batch-mutates entities (create/update/delete).

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-7"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`RxDBMutationsMap`](RxDBMutationsMap.md)&lt;`T`&gt; | Batch mutation options |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Throws

[RxDBReadOnlyError](../classes/RxDBReadOnlyError.md) read-only instance; nothing is written.

#### Throws

[PermissionDeniedError](../classes/PermissionDeniedError.md) the batch contains system-only operations; the list names every violation, and nothing is written.

#### Throws

[SortOrderError](../classes/SortOrderError.md) an invalid manual-ordering key, or key-less creation / group-field change on a remote-only / QueryCache primary; nothing is written.

#### Throws

[WorktreeTableSetMismatchError](../classes/WorktreeTableSetMismatchError.md) the batch contains entities not created/read on the table set this instance is currently attached to; nothing is written.

***

### notifyExternalUpdate() \{#notifyexternalupdate\}

```ts
notifyExternalUpdate<T>(
   EntityType, 
   id, 
   patch
): void;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:641](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L641)

Notifies an external update.
After the database is modified directly in ways that bypass the ORM (such as `rawQuery`),
call this method to trigger the standard event flow (QueryCache update + cross-tab broadcast).

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-8"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | Entity type |
| `id` | [`EntityStaticType`](../type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | Entity ID |
| `patch` | `Readonly`&lt;`Partial`&lt;`InstanceType`&lt;`T`&gt;&gt;&gt; | The changed fields; the cross-tab broadcast only carries the plain fields among them (see the "cross-tab contract" in remarks) |

#### Returns

`void`

#### Throws

[RxDBReadOnlyError](../classes/RxDBReadOnlyError.md) read-only instance (thrown synchronously; not a single event is dispatched).

#### Throws

On a database with the commit capability enabled, when the target is a versioned business entity, the capture hook throws a write-rejection error; in that case not a single event is dispatched.

#### Remarks

Row 11 of the write-entry semantics matrix: that external modification goes through none of the capture mount
points — the business table changes while the working tree gains no unit. Letting it dispatch as usual makes
the downstream QueryCache modify the in-memory entity according to the patch, so the working tree, the business
table, and memory each tell a different story.

**The core never does the classification itself; the whole decision is handed to the hook's
`WorkingTreeCaptureHook.gateExternalNotify()`.** Previously the core had to ask itself "what kind of table is
this" and then feed the result into the gate, meaning the core side kept half a sentence of capture semantics;
once capture rules follow the plugin, that half sentence became a second source of truth. What is handed over
now is only the entity identity and the not-yet-invoked dispatch body.

The hook is obtained via [RxDB.workingTreeCaptureHook](../classes/RxDB.md#workingtreecapturehook) rather than
`localAdapterSync`: the latter throws in the two cases of "no local adapter configured" and "not connected
yet", while this method can today be called on both kinds of database (it only dispatches events). Adding an
"unconnected" exception out of nowhere would violate FR-046's zero behavior difference.

**Cross-tab contract.** This event is also broadcast to other tabs via `RxDBTabsGateway`. Before broadcasting,
`patch` is copied into a snapshot containing only plain fields (subscribers inside this tab still receive the
original `patch`):
- Relation properties whose value is an entity instance (or an array holding entity instances) **do not travel cross-tab with the event** — an entity instance is a Proxy that cannot be structurally cloned, and on the other tab it would only be a plain object masquerading as an entity. For relation changes, please **also provide the foreign key column** (e.g. `authorId`); the other side reconstructs the relation from the foreign key column. When `patch` holds only the relation object and no foreign key column, what is broadcast is `{}`, the other side does not see this change, and there is no error of any kind;
- Only top-level keys are filtered: entity instances nested inside json values are not supported, and `postMessage` will throw `DataCloneError` because they cannot be structurally cloned.

***

### reindexEntityCache() \{#reindexentitycache\}

```ts
reindexEntityCache<T>(entity, previousId): void;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:409](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L409)

Rebuilds the identity cache index after the primary key is written.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-9"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | Entity type |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The entity instance whose primary key already holds the new value (must be the proxy instance — the same reference stored in the cache) |
| `previousId` | [`RxDBEntityId`](../type-aliases/RxDBEntityId.md) \| `undefined` | The primary key value before the write; `undefined` for the first assignment after construction |

#### Returns

`void`

#### Remarks

Called by the `set` interception of `createEntityProxy`, covering two cases:
- **Identity only after construction** (a primary key without a default value, such as `RxDBBranch.id`): the old slot does not exist, so only the new slot needs registering. Without this step, the instance in the caller's hands could never enter the identity cache, and a later hydrate would create another instance to update — two objects each holding their own state (RXD-070).
- **Primary key rename**: the old slot must be cleared, otherwise the entity looked up by the old id has an `id` that is already the new value, breaking the identity cache's invariant `cache.get(id).id === id` on the spot.

The old slot is deleted only when it actually holds **this one** instance: other references with the same id
must not be affected by this rename.

***

### remove() \{#remove\}

```ts
remove<T>(data): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:549](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L549)

Deletes an entity.
Deletes the entity from the database and dispatches the related events.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-10"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | Entity type |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `data` | `InstanceType`&lt;`T`&gt; | The entity instance to delete |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity instance after deletion.

#### Throws

Throws if deletion fails.

***

### removeEntityCache() \{#removeentitycache\}

```ts
removeEntityCache<T>(entity): void;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:424](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L424)

Removes an entity from the cache.
Removes the entity instance from the cache map.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-11"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | Entity type |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The entity instance to remove |

#### Returns

`void`

***

### removeMany() \{#removemany\}

```ts
removeMany<T>(entities): Promise<any[]>;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:492](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L492)

Batch deletion.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-12"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entities` | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`Promise`&lt;`any`[]&gt;

***

### reset() \{#reset\}

```ts
reset<T>(data): void;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:565](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L565)

Resets an entity.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-13"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `InstanceType`&lt;`T`&gt; |

#### Returns

`void`

#### Remarks

This used to be `async` here, while `EntityBase.reset` and the three system entities all declare
`reset: () => void` — the declaration did not match the runtime (it actually returned `Promise<void>`).
This method only rolls `status` back to `origin` and **touches no I/O**,
so the right fix is to make the implementation synchronous to match the declaration, rather than changing the
4 declarations to `Promise<void>`: the latter would give every existing `entity.reset()` call site an
unhandled Promise out of nowhere.

***

### resetForWorktreeTableSet() \{#resetforworktreetableset\}

```ts
resetForWorktreeTableSet(): void;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:246](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L246)

After this instance switches the table set it is attached to (US-314 B1.4): clears the entity identity cache
so all live queries rerun; repositories and subscriptions are kept as-is.

#### Returns

`void`

#### Remarks

The same id is two different sets of data in the two table sets: without clearing the identity cache, rows
read after the switch would be merged into the instance from before the switch. Does not go through
[EntityManager.cleanAllCache](#cleanallcache): that would destroy the repositories, completing the live
queries' observers so subscribers would never receive results again. Repositories without `refreshAllQueries`
(custom repositories not extending the core `Repository`) have no live queries handed to the QueryManager and
are skipped.

***

### save() \{#save\}

```ts
save<T>(entity): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:437](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L437)

Saves an entity.
Decides based on the entity's state whether to create a new entity or update an existing one.
If related entities need saving, a transaction is used for the batch save.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-14"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | Entity type |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity instance after saving.

***

### saveMany() \{#savemany\}

```ts
saveMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:472](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L472)

Batch save.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-15"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entities` | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

***

### update() \{#update\}

```ts
update<T>(data): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:596](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L596)

Updates an entity.
Updates the entity in the database — only the modified properties — and dispatches the related events.

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-16"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | Entity type |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `data` | `InstanceType`&lt;`T`&gt; | The entity instance to update |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity instance after updating.

#### Throws

Throws if updating fails.
