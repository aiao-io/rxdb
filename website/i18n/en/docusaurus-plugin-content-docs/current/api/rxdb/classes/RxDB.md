# RxDB

Defined in: [packages/rxdb/src/RxDB.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L96)

RxDB is a singleton object responsible for managing global features such as plugins, adapters, events and context
Only one RxDB instance can be created globally; all entities are managed through this instance
Every Entity class can also only be registered once

## Constructors

### Constructor

```ts
new RxDB(options): RxDB;
```

Defined in: [packages/rxdb/src/RxDB.ts:654](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L654)

#### Parameters

| Parameter | Type                                          | Description                |
| --------- | --------------------------------------------- | -------------------------- |
| `options` | [`RxDBOptions`](../interfaces/RxDBOptions.md) | RxDB configuration options |

#### Returns

`RxDB`

## Properties

### connected$ \{#connected\}

```ts
readonly connected$: Observable<boolean>;
```

Defined in: [packages/rxdb/src/RxDB.ts:430](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L430)

Connection state Observable

#### Remarks

This is a **whole-instance aggregated** signal: `true` as soon as any adapter connects. To wait for a specific adapter's table structure to be ready,
you must use [RxDB.adapterConnected$](#adapterconnected) — under multi-adapter configurations, the remote adapter connecting first sets this
to `true`, while the local adapter may still be stuck in `createTables()`.

Emits deduplicated: under multiple adapters, every single connect/disconnect recomputes the aggregated value, but subscribers should not be notified when the aggregated value has not changed.

---

### entityManager \{#entitymanager\}

```ts
readonly entityManager: EntityManager;
```

Defined in: [packages/rxdb/src/RxDB.ts:449](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L449)

---

### entitySync \{#entitysync\}

```ts
readonly entitySync: EntitySyncResolver;
```

Defined in: [packages/rxdb/src/RxDB.ts:469](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L469)

This instance's entity sync configuration resolver — the single answer to "which sync strategy an entity uses in this database".

#### Remarks

Priority: the instance override in `syncOverrides` \> the entity decorator `sync` \> the database-level `sync`. All sync consumers in the core and plugins
must read through it, and must not read `metadata.sync` back themselves: the same entity can use different
strategies in two instances, and the one on the metadata is only the decorator's declaration, not this database's effective configuration.

---

### localAdapter$ \{#localadapter\}

```ts
readonly localAdapter$: Observable<LocalRxDBAdapter>;
```

Defined in: [packages/rxdb/src/RxDB.ts:396](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L396)

---

### reachability \{#reachability\}

```ts
readonly reachability: ReachabilityMonitor;
```

Defined in: [packages/rxdb/src/RxDB.ts:445](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L445)

Remote reachability monitor, **alongside** rather than merged with [RxDB.connected$](#connected).

#### Remarks

The two have different semantics: `connected$` is about the **adapter lifecycle** (whether some adapter's `connect()` has finished),
while an HTTP adapter's `connect()` sends no network request at all — it reports connected even when offline.
Merging would make "adapter connected but network down", the most common state, inexpressible — and that is exactly
the only state local-first writes need to distinguish.

**Its lifecycle follows the instance rather than the connection epoch**: `#shutdown()` resets the instance to "can `init()` again",
but the network does not reset just because an adapter disconnected. Calling `destroy()` here would leave the reset instance with a
monitor stuck at the old state forever, whose `report()` no longer takes effect.

---

### remoteAdapter$ \{#remoteadapter\}

```ts
readonly remoteAdapter$: Observable<RemoteRxDBAdapter>;
```

Defined in: [packages/rxdb/src/RxDB.ts:411](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L411)

Remote adapter

#### Remarks

Caching semantics are the same as [RxDB.localAdapter$](#localadapter).

---

### schemaManager \{#schemamanager\}

```ts
readonly schemaManager: SchemaManager;
```

Defined in: [packages/rxdb/src/RxDB.ts:447](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L447)

---

### syncState \{#syncstate\}

```ts
readonly syncState: SyncStateHub;
```

Defined in: [packages/rxdb/src/RxDB.ts:459](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L459)

Sync state aggregation surface: whether the network is up, how much remains un-pushed, whether a push is in progress right now, what the last error was, and what the last rejection was.

#### Remarks

The three frameworks' `useSyncState()` binds directly to this snapshot. Its lifecycle is the same as [RxDB.reachability](#reachability) —
it follows the instance rather than the connection epoch, and `#shutdown()` does not destroy it: the panel must keep showing
"offline, N items pending push" during disconnection, which is exactly when it should speak up.

---

### worktreeTableSet$ \{#worktreetableset\}

```ts
readonly worktreeTableSet$: Observable<WorktreeTableSet>;
```

Defined in: [packages/rxdb/src/RxDB.ts:394](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L394)

The stream of [RxDB.worktreeTableSet](#worktreetableset-1): yields the current set on subscription, and emits the new set on re-mount (US-314 B1.4)

#### Remarks

Emitted only after the re-mount finishes: the entity cache is already cleared and live queries have started re-running against the new set (US-314 B2.3). Subscribers take the signal to refill their own caches
(drafts, full-text search handles) against the new set, which will not be wiped by the subsequent clearing.

## Accessors

### config \{#config\}

#### Get Signature

```ts
get config(): RxDBOptions;
```

Defined in: [packages/rxdb/src/RxDB.ts:524](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L524)

##### Returns

[`RxDBOptions`](../interfaces/RxDBOptions.md)

---

### context \{#context\}

#### Get Signature

```ts
get context(): RxDBContext;
```

Defined in: [packages/rxdb/src/RxDB.ts:503](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L503)

##### Returns

[`RxDBContext`](../interfaces/RxDBContext.md)

#### Set Signature

```ts
set context(context): void;
```

Defined in: [packages/rxdb/src/RxDB.ts:507](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L507)

##### Parameters

| Parameter | Type                                          |
| --------- | --------------------------------------------- |
| `context` | [`RxDBContext`](../interfaces/RxDBContext.md) |

##### Returns

`void`

---

### firstConnectedAt \{#firstconnectedat\}

#### Get Signature

```ts
get firstConnectedAt(): Date | undefined;
```

Defined in: [packages/rxdb/src/RxDB.ts:516](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L516)

##### Returns

`Date` \| `undefined`

---

### initialized \{#initialized\}

#### Get Signature

```ts
get initialized(): boolean;
```

Defined in: [packages/rxdb/src/RxDB.ts:545](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L545)

Whether this connection epoch has already gone through [RxDB.init](#init) (the first step of `connect()`)

##### Remarks

Entities are only bound and have their tables created during `init()`; plugins that add entities to `config.entities` use it to judge whether `use()` is already too late.
Still `true` inside the shutdown window, reset to `false` after teardown; also `false` after `init()` throws and rolls back.

##### Returns

`boolean`

---

### localAdapterIfConnected \{#localadapterifconnected\}

#### Get Signature

```ts
get localAdapterIfConnected(): LocalRxDBAdapter | undefined;
```

Defined in: [packages/rxdb/src/RxDB.ts:644](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L644)

**`Internal`**

The connected local adapter instance; `undefined` when not configured or not yet connected

##### Remarks

**This path does not throw.** The division of labor with [RxDB.localAdapterSync](#localadaptersync) is only on this point: that one serves
plugins that declare `inject: ['adapter:local']`, whose dependency is necessarily ready when called — failing to get it is the caller's
timing error and should blow up; this one serves code that runs **when an event arrives** — when an event arrives is not up to the receiver,
and a notification that drifts in during disconnection should not become an exception.

Its only consumer today is the capability plugin's [CAPABILITY\_ENABLED\_EVENT](../variables/CAPABILITY_ENABLED_EVENT.md) handler (FR-037):
the handler itself installs the capture hook on this epoch's adapter **synchronously** — no `await`, since
`await firstValueFrom(localAdapter$)` would yield a microtask, and writes in that gap would leave no trace.

But this only guarantees the handler itself does not yield, not **when** the handler runs: if the receiver is inside an open transaction,
[RxDB.dispatchEvent](#dispatchevent) queues this non-transactional event and only dispatches it when that transaction COMMITs,
so the hook installation is delayed by one transaction window. The event is not lost, and that transaction began before the capability was enabled anyway —
it does not need to be seen by the newly installed hook.

It reads **the instance the dispatcher bound for this epoch** (the same source as `localAdapterSync`), not a re-resolution by name:
the two may point to different objects across epochs, and the hook must be installed on the current epoch's one.

##### Returns

[`LocalRxDBAdapter`](../type-aliases/LocalRxDBAdapter.md) \| `undefined`

---

### localAdapterSync \{#localadaptersync\}

#### Get Signature

```ts
get localAdapterSync(): LocalRxDBAdapter;
```

Defined in: [packages/rxdb/src/RxDB.ts:489](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L489)

The currently connected local adapter instance, read **synchronously**.

##### Throws

Throws when the local adapter is not configured or not yet connected

##### Remarks

For plugins that declare `inject: ['adapter:local']`: the dependency is necessarily ready when `install()` is called,
and going through `await firstValueFrom(localAdapter$)` again just turns a certain value into an async one.

The division of labor with [RxDB.localAdapter$](#localadapter): this reads **the instance the dispatcher bound for this epoch**,
while `localAdapter$` re-resolves by name via [RxDB.getAdapter](#getadapter). The two may
point to different objects across epochs; code that depends on epoch identity (US-015 INV-3) must use this one. Reactive code that needs
to keep tracking adapter changes across epochs still uses `localAdapter$`.

When not connected it **throws instead of returning `undefined`**: synchronously fetching the adapter without a dependency declaration is the caller's timing
error, and returning a null value only postpones the explosion to somewhere further away.

##### Returns

[`LocalRxDBAdapter`](../type-aliases/LocalRxDBAdapter.md)

The local adapter instance

---

### readOnly \{#readonly\}

#### Get Signature

```ts
get readOnly(): boolean;
```

Defined in: [packages/rxdb/src/RxDB.ts:534](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L534)

Whether this is a read-only instance ([RxDBOptions.readOnly](../interfaces/RxDBOptions.md#readonly))

##### Remarks

All public write entrances of a read-only instance throw [RxDBReadOnlyError](RxDBReadOnlyError.md); the working tree plugin's read-only checkout uses it to open the snapshot database.

##### Returns

`boolean`

---

### systemContributions \{#systemcontributions\}

#### Get Signature

```ts
get systemContributions(): readonly RxDBSystemContribution[];
```

Defined in: [packages/rxdb/src/RxDB.ts:573](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L573)

**`Internal`**

The registered system contributions, in registration order

##### Remarks

For the core's internal write entrances that are **not on the `connect()` path** but must let contributors get involved — today only
`version/create-branch.ts`: it creates the branch in its own transaction, and the contributor's branch-level rows must be written into the **same**
transaction (see [RxDBSystemContribution.writeBranchRows](../interfaces/RxDBSystemContribution.md#writebranchrows)). `connect()` itself does not go through this getter,
it holds the same snapshot in a local variable.

Returns an array rather than the internal Map: the caller wants to "iterate through them one by one", and getting the Map would only teach it one fact
irrelevant to it — contributions are deduplicated by capability name.

##### Returns

readonly [`RxDBSystemContribution`](../interfaces/RxDBSystemContribution.md)[]

---

### systemEntities \{#systementities\}

#### Get Signature

```ts
get systemEntities(): readonly EntityType[];
```

Defined in: [packages/rxdb/src/RxDB.ts:594](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L594)

**`Internal`**

The system tables of **this database**: the four built into the core + those contributed by plugins this instance has `use()`d

##### Remarks

The single truth on the table-creation side, shared by two consumers: [SchemaManager.init](../interfaces/SchemaManager.md#init) appends it to
`config.entities`, and RxDB.#ensureSystemTables uses it to scope the system backfill batches of an existing database.
Neither may read the module-level `SYSTEM_ENTITIES` instead — that one is a live view for determination, only ever growing,
see RxDB.#contributed\_system\_entities.

The order is the table creation order, with the core's four first: contributed tables are allowed to reference `RxDBBranch` (that is where branch-level rows come from),
the reverse does not hold.

Returns a new array each time: `SchemaManager.init()` pushes things into `config.entities`, and getting the internal array
would mean letting it write back here.

##### Returns

readonly [`EntityType`](../type-aliases/EntityType.md)[]

---

### version \{#version\}

#### Get Signature

```ts
get version(): string;
```

Defined in: [packages/rxdb/src/RxDB.ts:520](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L520)

##### Returns

`string`

---

### workingTreeCaptureHook \{#workingtreecapturehook\}

#### Get Signature

```ts
get workingTreeCaptureHook():
  | WorkingTreeCaptureHook
  | undefined;
```

Defined in: [packages/rxdb/src/RxDB.ts:614](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L614)

**`Internal`**

This database's currently effective working tree capture hook; `undefined` when the commit capability is not enabled

##### Remarks

**This path does not throw.** It serves the write entrances in the core package that cannot be intercepted and can only take the gate at their own call sites
(`EntityManager.notifyExternalUpdate()` is the first, write entrance semantics matrix row 11). Those methods can currently be called on
instances with "no local adapter configured" and "not yet connected", so the hook is fetched through the **non-throwing**
RxDB.#resolve\_adapter\_instance rather than [RxDB.localAdapterSync](#localadaptersync) — the latter throws once in each of those two
situations, and attaching the gate would mean inventing a "not connected" exception for them, while FR-046 requires databases without the capability enabled to behave
byte-for-byte identically.

The hook lives on the **adapter instance** ([RxDBAdapterLocalBase.workingTreeCaptureHook](RxDBAdapterLocalBase.md#workingtreecapturehook)), not stored separately in this class:
`connect()` / `disconnect()` swap the instance, and a stored copy would point at the previous epoch's runtime after the swap.

##### Returns

\| [`WorkingTreeCaptureHook`](../interfaces/WorkingTreeCaptureHook.md)
\| `undefined`

---

### worktreeTableSet \{#worktreetableset-1\}

#### Get Signature

```ts
get worktreeTableSet(): WorktreeTableSet;
```

Defined in: [packages/rxdb/src/RxDB.ts:555](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L555)

The set of business tables this instance mounts (US-314 writable checkout): the main table set if it has never re-mounted

##### Remarks

One instance mounts only one table set at a time; the state lives only here; the adapter's `tableSet` reads from it.

##### Returns

[`WorktreeTableSet`](WorktreeTableSet.md)

## Methods

### adapter() \{#adapter\}

```ts
adapter(adapterName, adapter): this;
```

Defined in: [packages/rxdb/src/RxDB.ts:903](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L903)

Registers an adapter

#### Parameters

| Parameter     | Type                                                  | Description              |
| ------------- | ----------------------------------------------------- | ------------------------ |
| `adapterName` | `string` & `object`                                   | Adapter name             |
| `adapter`     | [`AdapterFactory`](../type-aliases/AdapterFactory.md) | Adapter factory function |

#### Returns

`this`

Returns the RxDB instance, supports chaining

---

### adapterConnected$() \{#adapterconnected\}

```ts
adapterConnected$(adapterName): Observable<boolean>;
```

Defined in: [packages/rxdb/src/RxDB.ts:1309](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1309)

The connection state stream of a specific adapter.

#### Parameters

| Parameter     | Type     | Description  |
| ------------- | -------- | ------------ |
| `adapterName` | `string` | Adapter name |

#### Returns

`Observable`&lt;`boolean`&gt;

Emits `true` when that adapter connects (table structure ready) and `false` when it disconnects; emits deduplicated

#### Remarks

The difference from the aggregated [RxDB.connected$](#connected) is that this one **recognizes the adapter**. What a plugin's `install()` waits for is
"the adapter I use has its tables created"; using the aggregated signal would let it through early when another adapter connects first.

The set timing is **before** plugin installation — bootstrap-phase plugins rely on it to release their wait; after plugin installation it would deadlock.
Therefore it means "the table structure is available", not "the whole `connect()` has finished".

---

### addEventListener() \{#addeventlistener\}

```ts
addEventListener<T>(type, listener): void;
```

Defined in: [packages/rxdb/src/RxDB.ts:1532](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1532)

#### Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ keyof [`RxDBEventMap`](../interfaces/RxDBEventMap.md) |

#### Parameters

| Parameter  | Type                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `type`     | `T`                                                                                                               |
| `listener` | [`EventListener`](../type-aliases/EventListener.md)&lt;[`RxDBEventMap`](../interfaces/RxDBEventMap.md)\[`T`\]&gt; |

#### Returns

`void`

---

### branchMaterializationSource() \{#branchmaterializationsource\}

```ts
branchMaterializationSource(source, scope?): this;
```

Defined in: [packages/rxdb/src/RxDB.ts:885](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L885)

Registers the first materialization source of metadata-only branches

#### Parameters

| Parameter | Type                                                                          | Description                                                                                                 |
| --------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `source`  | [`BranchMaterializationSource`](../interfaces/BranchMaterializationSource.md) | The materialization source, see [BranchMaterializationSource](../interfaces/BranchMaterializationSource.md) |
| `scope?`  | [`LifecycleScope`](../../utils/classes/LifecycleScope.md)                     | When provided, this registration is revoked when the scope is released; otherwise it is permanent           |

#### Returns

`this`

#### Throws

Error another source is already registered on this connection

#### Remarks

The shape is the same as [RxDB.queryCacheOutbox](#querycacheoutbox) (identity-guarded revocation, the write slot lives in `setup`), plus one
conflict check: a connection has **at most one** source. Two sources would mean the same branch can be materialized once by each of two
snapshots that do not know each other, so the latecomer throws on the spot instead of silently replacing the first; re-registering the same source is idempotent.

The official sync plugin registers it in each connection period's `install`: revoked with the scope on disconnect, re-registered on reconnect;
duplicate `use()` is deduplicated by the plugin and never reaches a second registration. Business code does not need to call it.

#### Example

```typescript
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';

rxdb.use(rxDBPluginSync); // registered automatically during assembly
```

---

### broadcastCapabilityEnabled() \{#broadcastcapabilityenabled\}

```ts
broadcastCapabilityEnabled(capability): void;
```

Defined in: [packages/rxdb/src/RxDB.ts:1528](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1528)

Notifies other same-origin connections: a capability was just enabled on this connection (FR-037).

#### Parameters

| Parameter    | Type     | Description                                                                |
| ------------ | -------- | -------------------------------------------------------------------------- |
| `capability` | `string` | The capability name, the same value as `RxDBSystemContribution.capability` |

#### Returns

`void`

#### Remarks

The capability bit is only read once **per connection period** (see [RxDBSystemContribution.bootstrapExisting](../interfaces/RxDBSystemContribution.md#bootstrapexisting)),
so in the "A enables, B already connected" arrangement, every subsequent write of B bypasses the capability **without a single error**.
This method is the channel that fills the gap: the enabler sends once, and other same-origin connections wire themselves up after receiving
[CAPABILITY\_ENABLED\_EVENT](../variables/CAPABILITY_ENABLED_EVENT.md).

**Only covers the same-origin BroadcastChannel reach.** Cross-process (Electron main/renderer, Tauri, Node multi-process)
and `multiInstance: false` instances do not receive it — those two cases are narrowed by the capability plugin's own self-healing path,
see `git show f9528e8f:specs/001-working-tree-commits/threat-model.md` §6.

The sender itself does not receive this event (the gateway ignores its own messages by `clientId`), which is correct:
it already wired itself synchronously inside `enable()`, and receiving it again would only make the wiring happen twice.

A no-op when the gateway is disabled (`multiInstance: false`), does not throw.

---

### connect() \{#connect\}

#### Call Signature

```ts
connect<K>(adapterName): Promise<RxDBAdapters[K]>;
```

Defined in: [packages/rxdb/src/RxDB.ts:1081](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1081)

Connects an adapter

The first `connect()` synchronously calls `init()` before the async bootstrap, installing registered plugins first and then initializing entities.
Plugins that contribute repositories or carry system contributions must be `use()`d before connecting; ordinary plugins may still be installed after connecting.

When an adapter of the same name is being torn down (`disconnect()` / `disconnectAll()` started but not finished), wait for this teardown to finish and
bootstrap a new connection, without handing out the old instance that is shutting down.

##### Type Parameters

| Type Parameter                                      |
| --------------------------------------------------- |
| <a id="type-parameter-k"></a> `K` _extends_ `never` |

##### Parameters

| Parameter     | Type | Description  |
| ------------- | ---- | ------------ |
| `adapterName` | `K`  | Adapter name |

##### Returns

`Promise`&lt;[`RxDBAdapters`](../interfaces/RxDBAdapters.md)\[`K`\]&gt;

Returns the connected adapter instance

##### Throws

Thrown when the bootstrap is aborted by `disconnect()` / `disconnectAll()` (see RxDB.#connect\_epochs)

#### Call Signature

```ts
connect(adapterName): Promise<IRxDBAdapter>;
```

Defined in: [packages/rxdb/src/RxDB.ts:1082](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1082)

Connects an adapter

The first `connect()` synchronously calls `init()` before the async bootstrap, installing registered plugins first and then initializing entities.
Plugins that contribute repositories or carry system contributions must be `use()`d before connecting; ordinary plugins may still be installed after connecting.

When an adapter of the same name is being torn down (`disconnect()` / `disconnectAll()` started but not finished), wait for this teardown to finish and
bootstrap a new connection, without handing out the old instance that is shutting down.

##### Parameters

| Parameter     | Type                | Description  |
| ------------- | ------------------- | ------------ |
| `adapterName` | `string` & `object` | Adapter name |

##### Returns

`Promise`&lt;[`IRxDBAdapter`](../interfaces/IRxDBAdapter.md)&gt;

Returns the connected adapter instance

##### Throws

Thrown when the bootstrap is aborted by `disconnect()` / `disconnectAll()` (see RxDB.#connect\_epochs)

---

### destroy() \{#destroy\}

```ts
destroy(): Promise<void>;
```

Defined in: [packages/rxdb/src/RxDB.ts:1451](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1451)

Terminal destruction: disconnect all adapters, then release the resources that **follow the instance** rather than the connection epoch.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Split from [RxDB.disconnectAll](#disconnectall) into a separate exit because the two have opposite reset semantics. `disconnectAll()`
goes through `#shutdown()`, resetting the instance to "can `init()` again"; while [RxDB.reachability](#reachability) and
[RxDB.syncState](#syncstate) by design do **not follow the connection epoch** — the network does not reset just because an adapter disconnected,
and the panel must keep showing "offline, N items pending push" during disconnection. So they can only be released here:
`reachability` holds the backoff timer and two long-lived subjects itself; the host-side pair of
`online` / `offline` listeners has been mounted on demand since US-025 D2 (`watch()` reference counting,
currently the only holder is the scope of `@aiao/rxdb-plugin-sync`). Without a terminal exit,
a backing-off instance would keep its timer alive along with itself, accumulating linearly with the number of instances in multi-instance / HMR / tests.

Idempotent; no need to call `disconnectAll()` first, it disconnects everything itself. After destruction `init()` throws and
`connect()` rejects (see [RxDB.init](#init)); the instance is not reusable.

#### Example

```typescript
// on component unmount / process exit
await rxdb.destroy();
```

---

### disconnect() \{#disconnect\}

```ts
disconnect(adapterName): Promise<void>;
```

Defined in: [packages/rxdb/src/RxDB.ts:1331](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1331)

Disconnects an adapter

Only disconnects the given adapter; the global teardown (plugins, gateway, versionManager and initialization state) runs only when all **connected** adapters have been disconnected. Avoids a single adapter disconnect mistakenly tearing down global resources.

If that adapter's `connect()` is still bootstrapping, this method invalidates it: the chain rejects with an abort error at the next await boundary,
instead of marking the adapter connected again after teardown. The invalidation is synchronous and does not wait for it to land
(see RxDB.#invalidate\_connect for the rationale).

Concurrent `disconnect()` of the same instance share one teardown; when `disconnectAll()` takes over mid-teardown,
this call does not shut down a second time, nor does it clean up connections created afterwards.

#### Parameters

| Parameter     | Type                | Description  |
| ------------- | ------------------- | ------------ |
| `adapterName` | `string` & `object` | Adapter name |

#### Returns

`Promise`&lt;`void`&gt;

---

### disconnectAll() \{#disconnectall\}

```ts
disconnectAll(): Promise<void>;
```

Defined in: [packages/rxdb/src/RxDB.ts:1424](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1424)

Disconnects all adapters and runs the global teardown.

Same policy as [RxDB.disconnect](#disconnect): first invalidate all in-flight `connect()`s; they reject with an abort error.
Without invalidation they would wake up after `#shutdown()` and refill the just-emptied connected set.

Adapters still inside their factory are waited for to settle; the created instances are disconnected together.

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

When an in-flight adapter factory, the global teardown or an adapter's `disconnect()` fails, throws the first error that appears;
by the time it throws, the teardown has fully completed, no adapter is left connected because one part failed

#### Remarks

A `connect()` of the same adapter during teardown waits for this teardown to finish and bootstraps again (see [RxDB.connect](#connect)).

---

### dispatchEvent() \{#dispatchevent\}

```ts
dispatchEvent(event): void;
```

Defined in: [packages/rxdb/src/RxDB.ts:1540](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1540)

#### Parameters

| Parameter | Type                                        |
| --------- | ------------------------------------------- |
| `event`   | [`RxDBEvent`](../type-aliases/RxDBEvent.md) |

#### Returns

`void`

---

### getAdapter() \{#getadapter\}

#### Call Signature

```ts
getAdapter<K>(adapterName): Promise<RxDBAdapters[K]>;
```

Defined in: [packages/rxdb/src/RxDB.ts:978](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L978)

Gets the adapter instance

##### Type Parameters

| Type Parameter                                        |
| ----------------------------------------------------- |
| <a id="type-parameter-k-1"></a> `K` _extends_ `never` |

##### Parameters

| Parameter     | Type | Description  |
| ------------- | ---- | ------------ |
| `adapterName` | `K`  | Adapter name |

##### Returns

`Promise`&lt;[`RxDBAdapters`](../interfaces/RxDBAdapters.md)\[`K`\]&gt;

Returns a Promise of the adapter instance

##### Throws

Throws when the adapter is not registered

#### Call Signature

```ts
getAdapter(adapterName): Promise<IRxDBAdapter>;
```

Defined in: [packages/rxdb/src/RxDB.ts:979](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L979)

Gets the adapter instance

##### Parameters

| Parameter     | Type                | Description  |
| ------------- | ------------------- | ------------ |
| `adapterName` | `string` & `object` | Adapter name |

##### Returns

`Promise`&lt;[`IRxDBAdapter`](../interfaces/IRxDBAdapter.md)&gt;

Returns a Promise of the adapter instance

##### Throws

Throws when the adapter is not registered

---

### getBranchMaterializationSource() \{#getbranchmaterializationsource\}

```ts
getBranchMaterializationSource():
  | BranchMaterializationSource
  | undefined;
```

Defined in: [packages/rxdb/src/RxDB.ts:1064](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1064)

Gets the registered first materialization source

#### Returns

\| [`BranchMaterializationSource`](../interfaces/BranchMaterializationSource.md)
\| `undefined`

The source itself when the sync plugin is installed and a connection period is active, otherwise `undefined`

#### Remarks

`undefined` is handed to the working tree plugin to throw `branch_not_materialized` (`source_unavailable`) —
this layer does not know which branch to name.

---

### getPlugins() \{#getplugins\}

```ts
getPlugins(name): readonly IRxDBPlugin[];
```

Defined in: [packages/rxdb/src/RxDB.ts:967](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L967)

Gets the registered plugin instances by name.

#### Parameters

| Parameter | Type     | Description                                                        |
| --------- | -------- | ------------------------------------------------------------------ |
| `name`    | `string` | The plugin's [IRxDBPlugin.name](../interfaces/IRxDBPlugin.md#name) |

#### Returns

readonly [`IRxDBPlugin`](../interfaces/IRxDBPlugin.md)[]

A snapshot of the complete set of same-name candidates, in [RxDB.use](#use) order; an empty array if none

#### Remarks

Returns an **array** rather than a single instance: duplicate names are allowed (D4), and the caller decides which one to take. Plugin factories use it
for the "have I already been installed" self-check, which is more reliable than hanging an own property on the database instance and probing with
`hasOwnProperty` — such facade properties are for consumers, not for probing, and renaming the facade would empty the self-check.

Returns a new array each time: callers pushing into it will not write back to the host index.

---

### getQueryCacheEngine() \{#getquerycacheengine\}

```ts
getQueryCacheEngine():
  | QueryCacheEngineFactory
  | undefined;
```

Defined in: [packages/rxdb/src/RxDB.ts:1038](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1038)

Gets the registered QueryCache read engine factory

#### Returns

\| [`QueryCacheEngineFactory`](../interfaces/QueryCacheEngineFactory.md)
\| `undefined`

The factory itself when the plugin is installed, otherwise `undefined`

#### Remarks

`undefined` is intentionally exposed: the caller throws [RxDBMissingPluginError](RxDBMissingPluginError.md) itself,
rather than this layer throwing on its behalf — the startup guard of `connect()` must name the **specific entity**, which this layer does not know.

---

### getQueryCacheOutbox() \{#getquerycacheoutbox\}

```ts
getQueryCacheOutbox():
  | QueryCacheOutboxProvider
  | undefined;
```

Defined in: [packages/rxdb/src/RxDB.ts:1051](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1051)

Gets the registered query outbox provider

#### Returns

\| [`QueryCacheOutboxProvider`](../interfaces/QueryCacheOutboxProvider.md)
\| `undefined`

The provider itself when the plugin is installed, otherwise `undefined`

#### Remarks

Same as [RxDB.getQueryCacheEngine](#getquerycacheengine); `undefined` is handed to the caller to throw
[RxDBMissingPluginError](RxDBMissingPluginError.md) — this layer does not know which entity to name.

---

### getRepositoryConfig() \{#getrepositoryconfig\}

```ts
getRepositoryConfig(repositoryName):
  | IRepositoryConfig<RepositoryInstance<EntityType>>
  | undefined;
```

Defined in: [packages/rxdb/src/RxDB.ts:1011](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1011)

Gets the Repository configuration

#### Parameters

| Parameter        | Type     | Description     |
| ---------------- | -------- | --------------- |
| `repositoryName` | `string` | Repository name |

#### Returns

\| [`IRepositoryConfig`](../interfaces/IRepositoryConfig.md)&lt;[`RepositoryInstance`](../interfaces/RepositoryInstance.md)&lt;[`EntityType`](../type-aliases/EntityType.md)&gt;&gt;
\| `undefined`

The Repository configuration object, or undefined if it does not exist

---

### getRepositoryNames() \{#getrepositorynames\}

```ts
getRepositoryNames(): string[];
```

Defined in: [packages/rxdb/src/RxDB.ts:1025](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1025)

Lists the currently registered Repository names

#### Returns

`string`[]

The repository names in registration order

#### Remarks

For error reporting. When the `repository` declared by an entity is not found, saying only "not found" leaves people guessing whether it is a typo
or the plugin is not installed; listing what exists lets the caller see at a glance which kind is missing. The core itself only registers
`Repository`; everything else is mounted by plugins inside `install()`.

---

### init() \{#init\}

```ts
init(): void;
```

Defined in: [packages/rxdb/src/RxDB.ts:694](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L694)

Initializes the instance: assembles plugins, starts the Schema / Entity / Version managers, opens the gateway and the event system.

Idempotent: returns immediately when already initialized. `connect()` calls it itself in the synchronous phase; manual calls are usually unnecessary.

#### Returns

`void`

#### Throws

Thrown when the instance is inside the `#shutdown()` teardown window.

#### Remarks

If any manager's initialization throws, the initialization flag, plugin registrations and the connection scope are all rolled back;
after fixing the problem the caller can re-run `init()` and actually re-run the remaining steps, instead of being blocked by a half-built state.

---

### invalidateRemoteEntity() \{#invalidateremoteentity\}

```ts
invalidateRemoteEntity(entity, namespace?): void;
```

Defined in: [packages/rxdb/src/RxDB.ts:1504](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1504)

Reports "a remote entity's data has changed" (US-023).

For the host to call when it receives a change notification on its own push channel (WebSocket / SSE / polling).
Repositories using `SyncType.QueryCache` drop that entity's sync memory accordingly, and re-run all
live queries depending on it — the re-run fetches the authoritative data from the remote once more.

#### Parameters

| Parameter    | Type     | Default value | Description                                                                                |
| ------------ | -------- | ------------- | ------------------------------------------------------------------------------------------ |
| `entity`     | `string` | `undefined`   | The entity name, i.e. `@Entity({ name })`; an unregistered name is a no-op, does not throw |
| `namespace?` | `string` | `'public'`    | The namespace, default `'public'` (consistent with the `@Entity` default)                  |

#### Returns

`void`

#### Remarks

**The signature deliberately has no place to carry row data.** A row body from the push channel, written into the local cache without a
`fetchMetadata` comparison, would make "the local side holds a value nobody verified" the norm; this method only invalidates the cache,
and authoritative values are always decided by the pull during the re-run.

The event is not forwarded across tabs: the host of each tab receives the push on its own, and forwarding would only amplify one
change into N remote pulls across N tabs.

#### Example

```typescript
socket.on('changed', ({ entity }) => rxdb.invalidateRemoteEntity(entity));
```

---

### mountWorktreeTableSet() \{#mountworktreetableset\}

```ts
mountWorktreeTableSet(tableSet): Promise<void>;
```

Defined in: [packages/rxdb/src/RxDB.ts:1354](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1354)

Re-mounts a set of business tables (US-314 B1.4): from then on this instance's reads and writes land on this set, and the current branch is the branch it holds.

#### Parameters

| Parameter  | Type                                      | Description                                                                                                       |
| ---------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `tableSet` | [`WorktreeTableSet`](WorktreeTableSet.md) | The table set to mount; pass [WorktreeTableSet.MAIN](WorktreeTableSet.md#main) to mount back to the main checkout |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

[RxDBError](RxDBError.md) when the shadow table set holds no branch (the checkout is not open yet, or has been closed)

#### Remarks

One instance mounts only one table set at a time. The re-mount happens inside the adapter's transaction queue, serialized with in-flight reads and writes: transactions queued before it finish against the old set,
everything after it uses the new set. After the swap the entity identity cache is cleared (the same id is two pieces of data in two sets), and all live queries re-run —
subscriptions are kept as-is, emitting results from the new set.

"Holding" is checked against [WorktreeTableSet.heldBranchWhere](WorktreeTableSet.md#heldbranchwhere): a table set holding no branch cannot even have its current branch read after mounting.
The table set itself (creating tables, writing the hold key, seeding) is prepared by the checkout-opening flow; this method only mounts it.

---

### notifyWorktreeTableSetCreated() \{#notifyworktreetablesetcreated\}

```ts
notifyWorktreeTableSetCreated(executor, tableSet): Promise<void>;
```

Defined in: [packages/rxdb/src/RxDB.ts:1381](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1381)

A writable checkout's table set was just created: inside the transaction that created it, call each plugin's `worktreeTableSet.created` in `use()` order (US-314 B2.5, see `WorktreeTableSetHooks`).

#### Parameters

| Parameter  | Type                                                          | Description                             |
| ---------- | ------------------------------------------------------------- | --------------------------------------- |
| `executor` | [`TransactionExecutor`](../interfaces/TransactionExecutor.md) | The transaction that created the tables |
| `tableSet` | [`WorktreeTableSet`](WorktreeTableSet.md)                     | The table set just created and seeded   |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Auxiliary objects plugins build on business tables (such as full-text indexes) must exist on every shadow table set. If any plugin throws, the whole transaction rolls back: the checkout is either created together with these
auxiliary objects, or not at all. Called by the table-set-creating side (the working tree plugin's `checkouts.add()`) after `createWorktreeTableSet`.

---

### queryCacheEngine() \{#querycacheengine\}

```ts
queryCacheEngine(factory, scope?): this;
```

Defined in: [packages/rxdb/src/RxDB.ts:820](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L820)

Registers the QueryCache read engine factory

#### Parameters

| Parameter | Type                                                                  | Description                                                                                       |
| --------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `factory` | [`QueryCacheEngineFactory`](../interfaces/QueryCacheEngineFactory.md) | The engine factory, see [QueryCacheEngineFactory](../interfaces/QueryCacheEngineFactory.md)       |
| `scope?`  | [`LifecycleScope`](../../utils/classes/LifecycleScope.md)             | When provided, this registration is revoked when the scope is released; otherwise it is permanent |

#### Returns

`this`

#### Remarks

The shape aligns with [RxDB.repository](#repository) point by point: revocation is guarded by **factory object identity** (if the slot already holds
someone else's factory when released, a later registration has covered this one, and nothing is done), and the **slot-writing step itself** lives in
`acquire()`'s `setup` — when the scope is no longer `active`, `acquire()` throws synchronously and does not run
`setup`, so the registration does not happen and no orphan registration that nobody can revoke is left behind.

The only difference from the facade-axis `repository()` is what gets registered: that one decides the public surface of `getRepository(E)`,
this one only fills the read implementation of `SyncType.QueryCache`, changing no public surface.

#### Example

```typescript
import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';

rxdb.use(rxDBPluginQueryCache);
```

---

### queryCacheOutbox() \{#querycacheoutbox\}

```ts
queryCacheOutbox(provider, scope?): this;
```

Defined in: [packages/rxdb/src/RxDB.ts:851](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L851)

Registers the query outbox provider

#### Parameters

| Parameter  | Type                                                                    | Description                                                                                       |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `provider` | [`QueryCacheOutboxProvider`](../interfaces/QueryCacheOutboxProvider.md) | The outbox provider, see [QueryCacheOutboxProvider](../interfaces/QueryCacheOutboxProvider.md)    |
| `scope?`   | [`LifecycleScope`](../../utils/classes/LifecycleScope.md)               | When provided, this registration is revoked when the scope is released; otherwise it is permanent |

#### Returns

`this`

#### Remarks

The shape is identical to [RxDB.queryCacheEngine](#querycacheengine) point by point (identity-guarded revocation, the write slot lives in `setup`).

Split into two registration ports instead of having the sync plugin hand both things over together: the outbox ships with the sync plugin and
the read engine ships with the querycache plugin; each package registers its own half and neither needs to know the other.

#### Example

```typescript
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';

rxdb.use(rxDBPluginSync);
```

---

### removeEventListener() \{#removeeventlistener\}

```ts
removeEventListener<T>(type, listener): void;
```

Defined in: [packages/rxdb/src/RxDB.ts:1536](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1536)

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-1"></a> `T` _extends_ keyof [`RxDBEventMap`](../interfaces/RxDBEventMap.md) |

#### Parameters

| Parameter  | Type                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `type`     | `T`                                                                                                               |
| `listener` | [`EventListener`](../type-aliases/EventListener.md)&lt;[`RxDBEventMap`](../interfaces/RxDBEventMap.md)\[`T`\]&gt; |

#### Returns

`void`

---

### repository() \{#repository\}

```ts
repository<RT>(
   repositoryName,
   config,
   scope?
): this;
```

Defined in: [packages/rxdb/src/RxDB.ts:781](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L781)

Registers a Repository
Unified interface; all repository configurations are stored in RxDB

#### Type Parameters

| Type Parameter                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-rt"></a> `RT` _extends_ [`RepositoryInstance`](../interfaces/RepositoryInstance.md)&lt;[`EntityType`](../type-aliases/EntityType.md)&gt; |

#### Parameters

| Parameter        | Type                                                                  | Description                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `repositoryName` | `string`                                                              | Repository name                                                                                                                               |
| `config`         | [`IRepositoryConfig`](../interfaces/IRepositoryConfig.md)&lt;`RT`&gt; | Repository configuration object                                                                                                               |
| `scope?`         | [`LifecycleScope`](../../utils/classes/LifecycleScope.md)             | When provided, this registration is revoked when the scope is released; otherwise it is permanent (consistent with the pre-refactor behavior) |

#### Returns

`this`

#### Remarks

Revocation is guarded by **configuration object identity**: if the table already holds someone else's config when released, a later registration has covered this one,
and nothing is done — otherwise a plugin that installs first and uninstalls later would delete the latercomer's registration along with its own.

When `scope` is passed, **the table-writing step itself** lives in `setup`: when the scope is no longer `active`,
`acquire()` throws synchronously and does not run `setup`, so the registration does not happen either. Written outside `acquire()`,
the registration would stay in the table with nobody able to revoke it — exactly the kind of orphan this primitive's "a throwing `setup` never enters the list" rule
exists to prevent.

---

### use() \{#use\}

```ts
use<Options>(plugin, options?): RxDB;
```

Defined in: [packages/rxdb/src/RxDB.ts:937](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L937)

Installs a plugin

Plugins registered before `init()` are installed together during `init()`;
ordinary plugins registered after `init()` are installed immediately, keeping symmetry with the destroy during `shutdown`.
Plugins that contribute repositories must be `use()`d before `init()`, otherwise entities initialize against the old repository registry.
Plugins with system contributions must also be registered before `init()`; late installation is rejected outright.
The first `connect()` synchronously calls `init()`, so these two kinds of plugins must be installed before the first `connect()`.

A call inside the shutdown window (`disconnect()` / `disconnectAll()` started but not finished) only **registers**,
installation is deferred to the next `init()` — this epoch is on its way out, and things installed into it would have no symmetric teardown entry.
See RxDB.#shutting\_down.

**Installation** failures do not escape from here: a failing synchronous `install()` is only `console.error`ed; both async and sync failures are recorded into
the installation Promise and propagated by subsequent `connect()` — including **repeated `connect()` of the same adapter**: the cache-hit
path also runs an extra installation wait, otherwise a plugin `use()`d after connecting could never surface its failure (`use()` returns
`this` synchronously and has no error exit of its own).

**Planning-phase** errors do the opposite and throw synchronously from here: dependency cycles ([RxDBPluginDependencyCycleError](RxDBPluginDependencyCycleError.md)) and
dependency ambiguity ([RxDBPluginAmbiguousDependencyError](RxDBPluginAmbiguousDependencyError.md)) are both judged **before** being written into the registry; when thrown, this
registration does not happen at all. Both are self-inconsistent declarations; reporting them at `connect()` would be too late — and the caller
has no entry to remove a plugin, so letting it into the registry would permanently poison every subsequent `init()`.

#### Type Parameters

| Type Parameter                                | Default type |
| --------------------------------------------- | ------------ |
| <a id="type-parameter-options"></a> `Options` | `never`      |

#### Parameters

| Parameter  | Type                                                   | Description        |
| ---------- | ------------------------------------------------------ | ------------------ |
| `plugin`   | [`Plugin`](../type-aliases/Plugin.md)&lt;`Options`&gt; | Plugin constructor |
| `options?` | `Options`                                              | Plugin options     |

#### Returns

`RxDB`

Returns the RxDB instance, supports chaining

#### Throws

[RxDBPluginDependencyCycleError](RxDBPluginDependencyCycleError.md) adding this plugin forms a cycle in the dependency graph

#### Throws

[RxDBPluginAmbiguousDependencyError](RxDBPluginAmbiguousDependencyError.md) some injected plugin name has multiple candidates

---

### worktreeTableSetFingerprint() \{#worktreetablesetfingerprint\}

```ts
worktreeTableSetFingerprint(tableSet): string;
```

Defined in: [packages/rxdb/src/RxDB.ts:1398](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/RxDB.ts#L1398)

The fingerprint of a writable checkout's table set (US-314 B2.6): the structure fingerprints of the member entities ([WorktreeTableSet.schemaFingerprintOf](WorktreeTableSet.md#schemafingerprintof)),
combined with the fingerprints of each plugin's table-set hooks (`WorktreeTableSetHooks.fingerprint`).

#### Parameters

| Parameter  | Type                                      | Description                                                     |
| ---------- | ----------------------------------------- | --------------------------------------------------------------- |
| `tableSet` | [`WorktreeTableSet`](WorktreeTableSet.md) | That table set; only its members are considered, not the suffix |

#### Returns

`string`

64 hex-digit SHA-256

#### Remarks

Recorded on the registration row when opening the checkout; if it does not match at mount time, the whole set is rebuilt: the entity structure changed,
or the auxiliary objects plugins built on the tables changed (such as the tokenizer version of a full-text index),
and the old set no longer matches. Plugins are sorted by name; the `use()` order does not affect it.
