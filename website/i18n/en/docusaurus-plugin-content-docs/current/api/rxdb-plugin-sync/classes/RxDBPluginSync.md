# RxDBPluginSync

Defined in: [packages/rxdb-plugin-sync/src/plugin.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/plugin.ts#L50)

The push/pull sync / conflict / repository dependency ordering plugin.

## Remarks

**Declares `inject: ['plugin:history']`**, and only that one:

- The history plugin is needed because at the end of a round trip the undo
  boundary must be invalidated and the pullable count settled, and the owners
  of that state are on the history side. [SyncManager](../interfaces/SyncManager.md)
  takes the narrow interface `rxdb.versionManager.syncBridge`; without it,
  construction cannot even begin. With the dependency missing the host does not
  install this plugin and only warns once, so the `rxdb.syncManager` slot does
  not exist — no history means no sync, which is the truth.
- **Not `adapter:remote`**: sync entries are initiated per call, and the
  assembly phase issues no adapter reads or writes; while the `connected$`
  auto-push subscription mounted by [SyncManager.init](../interfaces/SyncManager.md#init)
  must already be subscribed before the first connection is in place, declaring
  an adapter dependency would push installation past the bootstrap chain and
  lose the first connection's auto-push hop.

All six host mutations are registered on `scope` and released by the host in reverse order on disconnect:

1. The `rxdb.syncManager` instance slot — undone together with `destroy()` on
   release, leaving the next epoch no manager pointing at a dismantled event bus;
2. The "recalculate pullable count" relay on [RxDB.syncState](../../rxdb/classes/RxDB.md#syncstate) —
   the remote adapter signals via `syncState.requestPullableRefresh()` after a
   live subscription resumes; it does not know [SyncManager](../interfaces/SyncManager.md),
   and catching this hop is this plugin's job (before US-025 phase D this
   binding sat on the history plugin and moved over together with
   `refreshPullableCount`). With no plugin installed that request goes into the
   void — the truth of "pullable count maintained by nobody".
3. The [RxDB.queryCacheOutbox](../../rxdb/classes/RxDB.md#querycacheoutbox) outbound
   queue slot — the read engine of QueryCache entities relies on it to tell
   "remote returned nothing" from "wrote offline locally". This one has **no**
   absent form: with the slot empty the core throws `RxDBMissingPluginError` at
   `connect()`, because "treat as empty set" equals deleting every offline write as an orphan.
4. The host's `online` / `offline` listeners — `ReachabilityMonitor` only mounts
   on `globalThis` when someone `watch()`es, and the only consumer of these two
   events is this package's sync listeners (`wakeup$` drives auto-push retries).
   A database without sync should not permanently gain a pair of listeners
   outliving the instance just because of `new RxDB()` (US-025 D2).
5. The [RxDB.branchMaterializationSource](../../rxdb/classes/RxDB.md#branchmaterializationsource)
   branch materialization source slot — branches pulled down by `syncBranches()`
   have only metadata, and the working tree plugin must materialize them from
   the paginated snapshots the source hands out before switching to one for the
   first time. The remote is this plugin's, so the source can only be handed
   out by this plugin too; with the slot empty that switch reliably throws
   `branch_not_materialized`, and there is no "materialize without sync
   installed" form. The slot holds at most one source, and this plugin occupies
   it upon registration.

## Extends

- [`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md)

## Implements

- [`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md)

## Constructors

### Constructor

```ts
new RxDBPluginSync(rxdb): RxDBPluginSync;
```

Defined in: packages/rxdb/dist/rxdb-plugin.d.ts:184

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) |

#### Returns

`RxDBPluginSync`

#### Inherited from

[`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md).[`constructor`](../../rxdb/classes/RxDBPluginBase.md#constructor)

## Properties

### inject \{#inject\}

```ts
readonly inject: readonly ["plugin:history"];
```

Defined in: [packages/rxdb-plugin-sync/src/plugin.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/plugin.ts#L52)

Declares which dependencies this plugin needs ready before it can be installed.

#### Remarks

Not declared (or declared as an empty array) = no dependencies; installed
immediately at `init()`, behaving exactly as before this field was introduced.

Once declared, the host is responsible for the timing, and the plugin must
**not** wait again inside `install()`: the host's `connect()` is itself waiting
for plugin installation, and a plugin waiting back on `connect()` would
deadlock on itself. This is exactly why this field exists — before it, the
search plugin could only dodge the deadlock with the fragile timing convention
"`adapterConnected$` is set before plugin installation".

With dependencies unsatisfied: the plugin is **not installed**, produces no
scope, and does not enter the host's install-waiting set, so `connect()`
resolves normally instead of hanging; the host additionally issues one
`console.warn` listing the missing items, never staying silent.

Dependencies are accounted by **instance reference**, not by name or a boolean
bit. A same-name adapter swapped for a new instance (never turning empty in
between) also counts as an epoch change: the old scope is released and the
plugin reinstalls with the new instance and gets a brand-new child scope.
Conversely, an installation failure within the same epoch does **not**
auto-retry — retries only happen when the epoch really changes.

Phase A only resolves `adapter:*`. Declaring `plugin:*` syntax is legal at this
point, but the resolution result is always "not ready": the plugin stays
waiting and triggers the warn above, never silently disappearing.

#### Example

```ts
readonly inject = ['adapter:local'] as const;

async install(scope: LifecycleScope) {
  // Here adapter:local is guaranteed ready; take and use it directly
  const adapter = this.rxdb.localAdapterSync;
}
```

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`inject`](../../rxdb/interfaces/IRxDBPlugin.md#inject)

***

### lifecycle \{#lifecycle\}

```ts
readonly lifecycle: "scoped";
```

Defined in: [packages/rxdb-plugin-sync/src/plugin.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/plugin.ts#L51)

Declares that this plugin has migrated to scope teardown.

#### Remarks

With the value `'scoped'`, the host stops after releasing the plugin scope and
does **not** call [IRxDBPlugin.destroy](../../rxdb/interfaces/IRxDBPlugin.md#destroy).
Dual-version plugins (that must install into both old and new hosts) write
both: the old host doesn't know this field and only runs `destroy()`; the new
host does know it and only runs the scope — neither side cleans up twice.

The reason for an explicit marker instead of checking whether `install.length`
has a parameter: transpiled output, `Function.prototype.bind`, and minifiers
all rewrite the parameter count, and treating it as a contract would misjudge.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`lifecycle`](../../rxdb/interfaces/IRxDBPlugin.md#lifecycle)

***

### name \{#name\}

```ts
name: Uncapitalize<string> = 'sync';
```

Defined in: [packages/rxdb-plugin-sync/src/plugin.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/plugin.ts#L53)

The plugin name, used for logging and host-side error attribution

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`name`](../../rxdb/interfaces/IRxDBPlugin.md#name)

***

### rxdb \{#rxdb\}

```ts
protected readonly rxdb: RxDB;
```

Defined in: packages/rxdb/dist/rxdb-plugin.d.ts:183

#### Inherited from

[`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md).[`rxdb`](../../rxdb/classes/RxDBPluginBase.md#rxdb)

## Methods

### install() \{#install\}

```ts
install(scope): void;
```

Defined in: [packages/rxdb-plugin-sync/src/plugin.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/plugin.ts#L55)

Installs the plugin.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `scope` | [`LifecycleScope`](../../utils/classes/LifecycleScope.md) | This connection epoch's plugin activation scope; one `acquire()` wraps only one acquisition step that may throw |

#### Returns

`void`

#### Remarks

Throwing (including a `Promise` rejection) counts as an installation failure:
the host first releases **the part already registered into `scope`** in reverse
order, then propagates the original error to `connect()`. Cleanup errors during
rollback are only logged and never overwrite the installation error.

An implementor not writing the parameter breaks no contract — `install()` and
`install(scope)` satisfy this interface equally.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`install`](../../rxdb/interfaces/IRxDBPlugin.md#install)
