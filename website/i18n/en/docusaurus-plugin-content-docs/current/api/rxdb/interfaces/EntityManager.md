# EntityManager

Defined in: [packages/rxdb/src/entity/entity-manager.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L88)

Entity manager

Manages the entire lifecycle of entities, including:
1. Creation, update, and deletion of entities
2. Entity cache management
3. Entity relation handling
4. Entity repository access
5. Entity proxies and change tracking

The entity manager is the bridge connecting entities, repositories, and the database;
it keeps entity state consistent and handles the relations between entities.

## Properties

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L125)

The RxDB instance, providing database access and event dispatch

## Methods

### addEntityCache() \{#addentitycache\}

```ts
addEntityCache<T>(entity): void;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:387](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L387)

Adds an entity to the cache
Adds the entity instance to the cache map of the corresponding type

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | The entity type |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The entity instance to cache |

#### Returns

`void`

#### Remarks

Entities whose primary key has no value yet are **not cached**: the identity cache is indexed by id, and at this moment it has no identity to index.
Before, they were written in anyway, so all id-less entities shared the single `undefined` slot
and `getEntityRef(T, undefined)` returned a random one of them — sparse hydration updated through it, modifying a different record.
When the primary key is assigned later, [reindexEntityCache](#reindexentitycache) registers it (triggered by the Proxy set interception), so nothing is missed.

***

### cleanAllCache() \{#cleanallcache\}

```ts
cleanAllCache(): void;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:261](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L261)

Clears all caches

#### Returns

`void`

#### Remarks

Destroys repository by repository in isolation: a `destroy()` throw from one repository must neither let later repositories skip destruction
nor let the cache clearing itself be skipped. The first exception is kept and re-thrown together after the clearing finishes, so callers still see the original error.

***

### create() \{#create\}

```ts
create<T>(data): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:581](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L581)

Creates an entity
Creates a new entity in the database and dispatches the related events

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-1"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | The entity type |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `data` | `InstanceType`&lt;`T`&gt; | The entity instance to create |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The created entity instance

#### Throws

Throws an error if creation fails

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

Creates an entity reference
Creates or fetches an entity instance from the provided data and sets its status
If the entity already exists in the cache, the cached instance is returned

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-2"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | The entity type |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | The entity type |
| `data` | [`EntityUpdateData`](../type-aliases/EntityUpdateData.md)&lt;`T`&gt; | Entity data; must contain the id |
| `status?` | `EntityStatusOptions`&lt;`T`&gt; | Optional entity status configuration |

#### Returns

[`EntityInstanceType`](../type-aliases/EntityInstanceType.md)&lt;`T`&gt;

The created or fetched entity instance

***

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:288](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L288)

Destroys the manager and unbinds the entity classes

#### Returns

`void`

#### Remarks

The unbinding goes in a finally: even if [EntityManager.cleanAllCache](#cleanallcache) throws because a repository's destruction failed,
the entity classes must still be unbound from this manager, otherwise the next database reusing the same entity class would be
wrongly blocked by "registered with multiple RxDB instances". The original error is re-thrown as-is after the unbinding completes.

The unbinding targets the entity classes actually bound at `init()`, not the current `config.entities`:
entities removed by plugins when their scope is released must also be unbound, otherwise the entity class stays permanently bound to a torn-down instance.

***

### getEntityRef() \{#getentityref\}

```ts
getEntityRef<T>(EntityType, id): 
  | EntityInstanceType<T>
  | undefined;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:354](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L354)

Fetches an entity reference
Fetches the entity instance with the given ID from the cache

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-3"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | The entity type |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | The entity type |
| `id` | [`EntityStaticType`](../type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | The entity ID |

#### Returns

  \| [`EntityInstanceType`](../type-aliases/EntityInstanceType.md)&lt;`T`&gt;
  \| `undefined`

The entity instance, or undefined if it does not exist

***

### getRepository() \{#getrepository\}

```ts
getRepository<T, RT>(EntityType): RT;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:678](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L678)

Fetches the entity repository
Fetches the repository instance of the given entity type

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-4"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | The entity type |
| <a id="type-parameter-rt"></a> `RT` *extends* [`Repository`](../classes/Repository.md)&lt;`T`, [`IRepository`](IRepository.md)&lt;`T`&gt;&gt; | - |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | The entity type |

#### Returns

`RT`

The entity repository instance

***

### hasEntityRef() \{#hasentityref\}

```ts
hasEntityRef<T>(EntityType, id): boolean;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:370](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L370)

Checks whether an entity is in the cache
Determines whether the entity with the given ID has been initialized in the cache

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-5"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | The entity type |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | The entity type |
| `id` | [`EntityStaticType`](../type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | The entity ID |

#### Returns

`boolean`

Returns true if the entity exists in the cache

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
When multiple databases share one Entity class, a plain `new Entity()` cannot tell which database it targets;
use this method to preserve the entity constructor's defaults and custom initialization logic.

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

Mutates entities in bulk (create/update/delete)

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-7"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`RxDBMutationsMap`](RxDBMutationsMap.md)&lt;`T`&gt; | Bulk mutation options |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Throws

[RxDBReadOnlyError](../classes/RxDBReadOnlyError.md) Read-only instance; nothing is written

#### Throws

[PermissionDeniedError](../classes/PermissionDeniedError.md) The batch contains operations that only the system may write; the list names all violations, and nothing is written

#### Throws

[SortOrderError](../classes/SortOrderError.md) Invalid manual ordering key, or keyless creation / grouping-field change landing on a remote-only / QueryCache primary side; nothing is written

#### Throws

[WorktreeTableSetMismatchError](../classes/WorktreeTableSetMismatchError.md) The batch contains entities not created or read from the table set this instance is currently attached to; nothing is written

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

Notifies an external update
After the database is modified directly, bypassing the ORM via rawQuery or similar,
call this method to trigger the standard event flow (QueryCache update + cross-tab broadcast)

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-8"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `EntityType` | `T` | The entity type |
| `id` | [`EntityStaticType`](../type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | The entity ID |
| `patch` | `Readonly`&lt;`Partial`&lt;`InstanceType`&lt;`T`&gt;&gt;&gt; | The changed fields; the cross-tab broadcast only carries the plain fields among them (see the "cross-tab contract" in remarks) |

#### Returns

`void`

#### Throws

[RxDBReadOnlyError](../classes/RxDBReadOnlyError.md) Read-only instance (thrown synchronously; not a single event is dispatched)

#### Throws

On libraries with the commit capability enabled, when the target is a versioned business entity, the capture hook throws a write rejection error;
  in that case not a single event is dispatched

#### Remarks

Row 11 of the write-entrance semantics matrix: the change made outside the library goes through no capture mount point, so the business table changes while the working tree gains no unit.
Letting it dispatch as usual would make the downstream QueryCache modify the in-memory entity according to the patch, leaving the working tree, the business table, and memory each telling a different story.

**The core does none of the classification itself; the whole determination is handed to the hook's
`WorkingTreeCaptureHook.gateExternalNotify()`.** Before, it had to ask itself "what kind does this table count as"
and then feed the answer into the gate, meaning the core kept half a sentence of capture semantics; once capture rules moved with the plugin, that half became a second source of truth.
Now only the entity identity and the not-yet-invoked dispatch body are handed over.

The hook is fetched via [RxDB.workingTreeCaptureHook](../classes/RxDB.md#workingtreecapturehook) rather than `localAdapterSync`: the latter throws in both the "no local
adapter configured" and "not connected yet" cases, while this method can be called on both kinds of libraries today (it only dispatches events).
Adding an invented "not connected" error to them would violate FR-046's zero behavior difference.

**The cross-tab contract.** This event is also broadcast to other tabs via `RxDBTabsGateway`. Before broadcasting, `patch` is copied into
a snapshot containing only plain fields (subscribers in this tab still receive the original `patch`):
- Relation properties whose value is an entity instance (or an array holding entity instances) do **not travel cross-tab** — entity instances are Proxies
  that cannot be structured-cloned, and on the other tab they would only be plain objects masquerading as entities. For relation changes, **also provide the foreign key column**
  (e.g. `authorId`); the other side restores the relation from the foreign key column. When `patch` contains only the relation object and no foreign key column,
  what gets broadcast is `{}`, the other side sees nothing of this change, and no error is reported;
- Only top-level keys are filtered: entity instances nested inside a json value are not supported, and `postMessage` throws
  `DataCloneError` because it cannot be structured-cloned.

***

### reindexEntityCache() \{#reindexentitycache\}

```ts
reindexEntityCache<T>(entity, previousId): void;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:409](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L409)

Rebuilds the identity cache index after the primary key is written

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-9"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | The entity type |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The entity instance whose primary key already holds the new value (must be the proxy instance, the same reference stored in the cache) |
| `previousId` | [`RxDBEntityId`](../type-aliases/RxDBEntityId.md) \| `undefined` | The primary key value before the write; `undefined` on the first assignment after construction |

#### Returns

`void`

#### Remarks

Called by the `set` interception of `createEntityProxy`, covering two cases:
- **Identity only after construction** (primary key without a default, e.g. `RxDBBranch.id`): the old slot does not exist, so only the new slot needs registering.
  Without this step, the instance in the caller's hands never enters the identity cache, and a later hydrate creates another instance to update,
  with the two objects each holding their own state (RXD-070).
- **Primary key rename**: the old slot must be cleared, otherwise the entity looked up by the old id already has the new `id` value
  and the identity cache's `cache.get(id).id === id` invariant breaks on the spot.

The old slot is deleted only when it really holds **this one** instance: other references with the same id should not be affected by this rename.

***

### remove() \{#remove\}

```ts
remove<T>(data): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:549](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L549)

Deletes an entity
Deletes the entity from the database and dispatches the related events

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-10"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | The entity type |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `data` | `InstanceType`&lt;`T`&gt; | The entity instance to delete |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The deleted entity instance

#### Throws

Throws an error if deletion fails

***

### removeEntityCache() \{#removeentitycache\}

```ts
removeEntityCache<T>(entity): void;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:424](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L424)

Removes an entity from the cache
Removes the entity instance from the cache map

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-11"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | The entity type |

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

Deletes in bulk

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

Resets an entity

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

This used to be `async`, while `EntityBase.reset` and three system entities all declare
`reset: () => void` — the declaration did not match the runtime (it actually returned `Promise<void>`).
This method only rolls `status` back to `origin` and **touches no I/O**,
so the right fix is to make the implementation synchronous to match the declaration, not to change the 4 declarations to `Promise<void>`:
the latter would give every existing `entity.reset()` call site an unhandled Promise out of thin air.

***

### resetForWorktreeTableSet() \{#resetforworktreetableset\}

```ts
resetForWorktreeTableSet(): void;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:246](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L246)

After this instance switches its attached table set (US-314 B1.4): clears the entity identity cache so all live queries re-run; repositories and subscriptions are kept as-is.

#### Returns

`void`

#### Remarks

The same id in two table sets is two copies of data: without clearing the identity cache, rows read after the switch would be merged into the instance from before the switch.
It does not go through [EntityManager.cleanAllCache](#cleanallcache): that would destroy repositories, completing the live queries' observers so subscribers never get results again.
Repositories without `refreshAllQueries` (custom repositories that do not extend the core `Repository`) have no live queries handed to the QueryManager, and are skipped.

***

### save() \{#save\}

```ts
save<T>(entity): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:437](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L437)

Saves an entity
Decides based on the entity status whether to create a new entity or update the existing one
If related entities need saving, a transaction is used for the batch save

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-14"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | The entity type |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The saved entity instance

***

### saveMany() \{#savemany\}

```ts
saveMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/entity/entity-manager.ts:472](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-manager.ts#L472)

Saves in bulk

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

Updates an entity
Updates the entity in the database, only updating modified properties, and dispatches the related events

#### Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t-16"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | The entity type |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `data` | `InstanceType`&lt;`T`&gt; | The entity instance to update |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The updated entity instance

#### Throws

Throws an error if the update fails
