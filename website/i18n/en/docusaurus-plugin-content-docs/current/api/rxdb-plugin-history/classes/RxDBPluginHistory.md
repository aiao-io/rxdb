# RxDBPluginHistory

Defined in: [packages/rxdb-plugin-history/src/plugin.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/plugin.ts#L37)

History / undo-redo / branch plugin.

## Remarks

**Declares no `inject`**: `VersionManager.init()` only attaches event listeners and subscriptions and issues no adapter reads or writes.
Declaring `adapter:local` would push installation behind the bootstrap chain, while `HistoryManager`'s branch stream must already be subscribed before the first
`rxdb_change` event arrives — installed late, that batch of changes misses history. This is also the pre-plugin ordering:
the core `new VersionManager()`'d in the constructor and called `init()` in `init()`, both before `schemaManager.init()`.

Both host mutations are registered on the `scope` and released in reverse order by the host on disconnect:

1. the `rxdb.versionManager` instance slot — on release it is taken down together with `destroy()`, not leaving the next
   epoch a manager pointing at a dismantled event bus. The slot is acquired first and therefore released last, so `destroy()`
   runs within the window where the slot is still readable;
2. the pushable-count subscription on [RxDB.syncState](../../rxdb/classes/RxDB.md#syncstate) — the hub lives as long as the instance, but the count only means something during a
   connection, so it goes through `bindPushableCount()` to get an unbind function instead of being passed in when the hub is constructed.

The "recompute pullable count" trampoline on the same hub is **not here**: `refreshPullableCount()` went to
`@aiao/rxdb-plugin-sync` with US-025 phase D, and catching `requestPullableRefresh()` is therefore that plugin's job too.
Installing only history without sync sends that request into the void — which is exactly the truth of "no sync, no pullable count".

## Extends

- [`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md)

## Implements

- [`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md)

## Constructors

### Constructor

```ts
new RxDBPluginHistory(rxdb): RxDBPluginHistory;
```

Defined in: packages/rxdb/dist/rxdb-plugin.d.ts:184

#### Parameters

| Parameter | Type                                 |
| --------- | ------------------------------------ |
| `rxdb`    | [`RxDB`](../../rxdb/classes/RxDB.md) |

#### Returns

`RxDBPluginHistory`

#### Inherited from

[`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md).[`constructor`](../../rxdb/classes/RxDBPluginBase.md#constructor)

## Properties

### lifecycle \{#lifecycle\}

```ts
readonly lifecycle: "scoped";
```

Defined in: [packages/rxdb-plugin-history/src/plugin.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/plugin.ts#L38)

Declares that this plugin has migrated to scoped teardown.

#### Remarks

With the value `'scoped'`, the host stops once it has released the plugin scope and **no longer** calls [IRxDBPlugin.destroy](../../rxdb/interfaces/IRxDBPlugin.md#destroy).
Dual-version plugins (that must install into both old and new hosts) write both: an old host does not know this field and only calls
`destroy()`; a new host knows it and only runs the scope, so neither side cleans up twice.

The reason for an explicit marker instead of checking whether `install.length` has a parameter: transpiled output, `Function.prototype.bind`
and minifiers all rewrite the parameter count, so treating it as a contract would misjudge.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`lifecycle`](../../rxdb/interfaces/IRxDBPlugin.md#lifecycle)

---

### name \{#name\}

```ts
name: Uncapitalize<string> = 'history';
```

Defined in: [packages/rxdb-plugin-history/src/plugin.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/plugin.ts#L39)

Plugin name, used for logs and host-side error attribution

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`name`](../../rxdb/interfaces/IRxDBPlugin.md#name)

---

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

Defined in: [packages/rxdb-plugin-history/src/plugin.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/plugin.ts#L41)

Installs the plugin.

#### Parameters

| Parameter | Type                                                      | Description                                                                                                             |
| --------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `scope`   | [`LifecycleScope`](../../utils/classes/LifecycleScope.md) | The plugin activation scope of this connection epoch; one `acquire()` wraps only one possibly-throwing acquisition step |

#### Returns

`void`

#### Remarks

Throwing (including a rejected `Promise`) counts as an install failure: the host first releases **the parts already registered on `scope`**
in reverse order, then propagates the original error to `connect()`. Cleanup errors during the rollback are only logged and never mask the install error.

Implementations that omit the parameter do not break the contract — `install()` and `install(scope)` both satisfy this interface.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`install`](../../rxdb/interfaces/IRxDBPlugin.md#install)
