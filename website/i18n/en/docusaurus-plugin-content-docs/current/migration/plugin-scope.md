# Plugin lifecycle migration

Plugin teardown changed from "the plugin keeps its own books + `destroy()`" to "the host hands out a scope + releases in reverse order". This page has two parts: what **plugin authors** must change, and what **application developers** will observe.

The built-in plugins (`graph` / `storage` / `workspace` / `search` / `working-tree`) have all migrated; upgrading is enough, no call-site changes — but do read the "Behavior changes" section below.

## Plugin authors

### 1. `install()` receives a scope

```diff
-install() {
-  this.#channel = new BroadcastChannel('example');
-  this.rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, this.#onCreate);
-}
+install(scope: LifecycleScope) {
+  scope.acquire(() => {
+    const channel = new BroadcastChannel('example');
+    this.#channel = channel;
+    return () => {
+      this.#channel = undefined;
+      channel.close();
+    };
+  }, 'example:channel');
+
+  scope.acquire(() => {
+    this.rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, this.#onCreate);
+    return () => this.rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, this.#onCreate);
+  }, 'example:entity-create');
+}
```

Splitting the steps is not a style issue: one `acquire()` may only wrap **one** acquisition that can throw; otherwise, when the second step throws, the resource created by the first step is not on the list and the host cannot reach it. See [Authoring plugins](/plugins/authoring.md) for the full contract.

### 2. Delete the handwritten `rollback()`

When `install()` throws, the host releases the registered parts in reverse order and propagates the original error to `connect()`. Plugins should not perform compensating cleanup in their own `catch`.

### 3. Declare `lifecycle: 'scoped'`

```diff
 export class RxDBPluginExample extends RxDBPluginBase implements IRxDBPlugin {
+  readonly lifecycle = 'scoped' as const;
   readonly name: Uncapitalize<string> = 'example';
```

With the declaration, the host stops after releasing the scope and no longer calls `destroy()`.

### 4. Handling `destroy()`

| Situation                                                         | What to do                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| All cleanup already moved into the scope                          | Delete `destroy()`                                                                    |
| Need compatibility with old hosts simultaneously                  | Keep `destroy()`, implement it as `this.#scope?.dispose()`, and mark it `@deprecated` |
| Still need to reset plugin state (state machine, internal caches) | Register a scope entry that only resets state, and still declare `lifecycle`          |

`destroy()` was not removed, only deprecated: plugins that do not declare `lifecycle` are still called once **after** the scope is released.

**Transition period**: under the [versioning and API stability policy](/versioning.md) deprecation cycle, `destroy()` stays for at least one minor version (one major-version cycle after 1.0), and removal happens in a breaking release with a migration guide entry. Its calling contract does not change during the transition; third-party plugins do not need to finish changing in this upgrade.

### 5. Constructors keep only registration-time work

Permanent identity properties published as `rxdb.xxx` stay in the constructor; IndexedDB stores, channels, subscriptions, and listeners all defer to `install()`. A scope is not reused across epochs — do not store it on an instance field and read it across epochs.

## Behavior changes

All of the following are intentional semantic changes, observable right after upgrading.

### Plugin teardown goes from concurrent to serial in reverse order

`disconnectAll()` used to call each plugin's `destroy()` concurrently with `Promise.all`; it now tears plugins down **serially, in reverse insertion order**. Plugins have de facto dependencies on each other (the search plugin's index is built on the workspace plugin's entities), and concurrent teardown let a later-installed plugin keep reading an earlier-installed one halfway through its teardown.

Impact: teardown time becomes the sum of the plugins instead of the maximum. A throw from any plugin is logged, not short-circuited, and `disconnectAll()` always resolves.

### Disconnecting is no longer a terminal state for plugins

Identity properties like `rxdb.workspace` and `rxdb.searchPlugin` **still exist after disconnect**; re-calling `connect()` enters a new epoch and reuses the same plugin instance.

Scenarios that previously required "rebuilding the `RxDB` instance" now just reconnect.

Calling a method that needs epoch resources between two epochs yields a clear error instead of permanent breakage:

```typescript
await db.disconnectAll();
await db.workspace.flush();
// Error: workspace plugin is not installed in the current connection epoch

await db.searchPlugin.ready;
// SearchError: plugin is destroyed — the connection epoch that installed it was released; await db.connect() again
```

Both recover after `await db.connect()`.

The two plugins' `ready` semantics **differ**; do not infer one from the other: `searchPlugin.ready` is per connection epoch — **pending** before `connect()` and during install, resolves on success, rejects with the original error on failure, and rejects with `destroyed` after the epoch is released (as above); while `workspace.ready` resolves immediately when not installed — it only means "the first `install()` has settled", not an availability verdict. Workspace availability is expressed by methods like `flush()` throwing.

### `workspace.changes$` no longer completes on teardown

The plugin instance survives across epochs, so its stream must outlive any single epoch. On disconnect, `changes$` simply stops emitting; it does not complete.

Subscriptions that rely on the complete signal for cleanup must switch to an explicit termination such as `takeUntil`:

```diff
-db.workspace.changes$.subscribe({ next: onChange, complete: onTeardown });
+db.workspace.changes$.pipe(takeUntil(this.destroyed$)).subscribe(onChange);
```

The framework bindings (Angular / React / Vue) already unsubscribe with their own component lifecycles; code using the bindings is unaffected.

### Workspace resource acquisition failures now throw from `install()`

IndexedDB open failures, BroadcastChannel creation failures, and the like used to happen in the plugin constructor, i.e. at the `use()` call site; they now defer to `install()`. The error moves from the `use()` location to `connect()`:

```diff
 const db = new RxDB({ /* … */ });
-try {
-  db.use(rxDBPluginWorkspace);
-} catch (err) { /* … */ }
+db.use(rxDBPluginWorkspace);
+try {
+  await db.connect();
+} catch (err) { /* … */ }
```

### Cross-tab messages are only delivered inside a live epoch

BroadcastChannel is set up and closed per epoch. Draft additions and removals after disconnect are not broadcast to other tabs and do not throw — they are silently skipped. Ensure the connection is live before relying on cross-tab sync.

### `db.storage` is only available while connected

The storage service used to be created at `use()` and stay mounted; now it is an epoch resource: mounted by `connect()`, removed by `disconnectAll()`.

```diff
 db.use(rxDBPluginStorage);
-await db.storage.list();       // usable right after use()
+await db.connect();
+await db.storage.list();       // only exists while connected
```

The type of `db.storage` is still the non-optional `RxdbFileStorage` — it describes the shape **while connected**, which is also the only time you should touch it. After disconnect the property is deleted, so reading it yields `undefined` and the type will not warn you. Teardown logic that must run after disconnect (revoking object URLs and the like) either goes before `disconnectAll()` or checks for `undefined` itself.

The `storage` accessor on the plugin instance is honestly marked optional:

```diff
-readonly storage: RxdbFileStorage;
+get storage(): RxdbFileStorage | undefined;
```

Code that holds the plugin instance directly (instead of going through `db.storage`) needs a null check.

When two storage plugin instances are installed on the same RxDB instance, the later one's whole `install()` is a no-op — there is no more `#ownsStorage`-style bookkeeping; "who installs, tears down" is guaranteed by the scope.

### The search plugin no longer calls `connect()` itself

`@aiao/rxdb-plugin-search` used to call `db.connect(localAdapterName)` inside `install()` to bring the connection up. Now it declares `inject: ['adapter:local']`, and the dispatcher installs it after the local adapter is ready — the plugin no longer connects for you.

```diff
 db.use(rxDBPluginSearch);
+await db.connect('sqlite-wasm');   // now you must connect explicitly
 await db.search('keyword');
```

Missing that line looks like this: the plugin stays waiting, `db.search()` throws "plugin not installed", and the console shows

```text
[RxDB] Plugin 'search' is not installed: unsatisfied dependencies [adapter:local]
```

Applications with route-based lazy loading should put `connect()` in the guard that enters the search page; do not expect the search plugin to bring the connection up as a side effect.

Conversely, this dependency also replaces the old deadlock workaround: no more `firstValueFrom(adapterConnected$)`-style waits inside `install()` — being called means the dependencies are ready, and you can read `db.localAdapterSync` synchronously. See the dependency injection section of [Authoring plugins](/plugins/authoring.md).

## See also

- [Authoring plugins](/plugins/authoring.md): the full contract and scope usage
- [Plugin upgrades and enabling](/migration/plugins.md): registering plugins and marking entity metadata
