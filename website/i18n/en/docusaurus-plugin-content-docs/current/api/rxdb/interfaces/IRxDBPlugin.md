# IRxDBPlugin

Defined in: [packages/rxdb/src/rxdb-plugin.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L80)

RxDB plugin interface

## Remarks

In `install()` a plugin receives a [LifecycleScope](../../utils/classes/LifecycleScope.md) **exclusive to this connection epoch**:
each host change registered acquires one undo entry on the scope; on disconnect the host releases them
serially in reverse order. Plugins therefore do not need to maintain their own list of "what was installed and what must be torn down",
nor a terminal-state flag — the scope itself has the three states `active / disposing / disposed`.

The scope is **not reused across epochs**: after `disconnectAll()` and a new `connect()`, `install()`
is passed a brand-new scope instance. Storing it on an instance field and reading it across epochs reads a released old object.

## Example

```ts
class MyPlugin extends RxDBPluginBase implements IRxDBPlugin {
  readonly lifecycle = 'scoped' as const;
  readonly name = 'my' as const;

  install(scope: LifecycleScope) {
    const channel = scope.acquire(() => {
      const bc = new BroadcastChannel('my');
      return () => bc.close();
    }, 'my:channel');
  }
}
```

## Properties

### inject? \{#inject\}

```ts
readonly inject?: readonly RxDBPluginDependency[];
```

Defined in: [packages/rxdb/src/rxdb-plugin.ts:162](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L162)

Declares which dependencies must be ready before this plugin can be installed.

#### Remarks

Not declaring (or declaring an empty array) = no dependencies, installed immediately at `init()`, with behavior exactly as before this field existed.

Once declared, the host owns the timing, and the plugin must **not** wait for it again inside `install()`: the host's
`connect()` is itself waiting for plugin installation, and a plugin waiting back on `connect()` would self-wait into a deadlock. That is exactly why this field
exists — before it, the search plugin could only rely on the fragile timing convention that
"`adapterConnected$` is set before plugin installation" to work around the deadlock.

When dependencies are unsatisfied: the plugin is **not installed**, produces no scope, and does not enter the host's installation wait set, so
`connect()` resolves normally instead of hanging; the host additionally emits one `console.warn` listing the missing items — not silent.

Dependencies are accounted by **instance reference**, not by name or boolean bit. A same-name adapter swapped for a new instance (never becoming empty in between)
also counts as an epoch change: the old scope is released, the plugin reinstalls with the new instance and gets a brand-new child scope.
Conversely, an installation failure within the same epoch does **not** auto-retry — retries only happen when the epoch actually changes.

Phase A only resolves `adapter:*`. Declaring `plugin:*` is syntactically legal at this point, but the resolution is always "not ready",
the plugin stays waiting and triggers the above warn — it does not silently disappear.

#### Example

```ts
readonly inject = ['adapter:local'] as const;

async install(scope: LifecycleScope) {
  // By this point adapter:local is certainly ready; take and use it directly
  const adapter = this.rxdb.localAdapterSync;
}
```

---

### instanceLifecycle? \{#instancelifecycle\}

```ts
readonly instanceLifecycle?: object;
```

Defined in: [packages/rxdb/src/rxdb-plugin.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L100)

Resources that follow the instance, wound down only at `RxDB.destroy()`; ordinary disconnects do not call it.

`stop` synchronously rejects new tasks; `dispose` releases resources after all adapters disconnect and in-flight transactions exit.
Both steps must be idempotent; a failure in one does not stop the other plugins from winding down.

#### dispose()

```ts
dispose(): void | Promise<void>;
```

Releases instance resources after the adapters stop.

##### Returns

`void` \| `Promise`&lt;`void`&gt;

#### stop()

```ts
stop(): void;
```

Stops accepting tasks, without waiting for in-flight transactions.

##### Returns

`void`

---

### lifecycle? \{#lifecycle\}

```ts
readonly lifecycle?: "scoped";
```

Defined in: [packages/rxdb/src/rxdb-plugin.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L92)

Declares that this plugin has migrated to scoped teardown.

#### Remarks

When the value is `'scoped'`, the host stops once it has released the plugin's scope, and does **not** call [IRxDBPlugin.destroy](#destroy).
Dual-version plugins (that must install into both old and new hosts) write both: old hosts do not recognize this field and only take
`destroy()`; new hosts recognize it and only take the scope — neither side cleans up twice.

The reason for an explicit marker instead of checking `install.length` for a parameter: transpilation output, `Function.prototype.bind`
and minifiers all rewrite the parameter count, so treating it as a contract would misjudge.

---

### name \{#name\}

```ts
name: Uncapitalize<string>;
```

Defined in: [packages/rxdb/src/rxdb-plugin.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L108)

The plugin name, used for logging and host-side error attribution

---

### system? \{#system\}

```ts
readonly system?: RxDBSystemContribution;
```

Defined in: [packages/rxdb/src/rxdb-plugin.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L121)

This plugin's contribution to the system layer: system entities, initial rows, system migrations and capability claims.

#### Remarks

The host reads this field **synchronously** in `use()`, before any adapter action — it cannot go through [IRxDBPlugin.install](#install),
for the reason given in the `@fileoverview` of [RxDBSystemContribution](RxDBSystemContribution.md) (a plugin declaring `inject` necessarily runs after
table creation, while system tables must come out in the same batch as table creation).

Plugins carrying this field must be `use()`d before `connect()`: if too late, the host **throws** rather than silently skipping.
The consequence of silently skipping is a database where "the plugin is installed but the tables were never created" — and that produces no compile error.

---

### worktreeTableSet? \{#worktreetableset\}

```ts
readonly worktreeTableSet?: WorktreeTableSetHooks;
```

Defined in: [packages/rxdb/src/rxdb-plugin.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L129)

This plugin's contribution to the writable checkout table sets (US-314 B2.5), see [WorktreeTableSetHooks](WorktreeTableSetHooks.md).

#### Remarks

Only plugins that build auxiliary objects (like full-text indexes) on business tables need to declare this.

## Methods

### ~~destroy()?~~ \{#destroy\}

```ts
destroy?(): void | Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-plugin.ts:188](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L188)

Tears down the plugin.

#### Returns

`void` \| `Promise`&lt;`void`&gt;

#### Deprecated

Use `scope.acquire()` in `install(scope)` to register undo entries, and declare
[IRxDBPlugin.lifecycle](#lifecycle) as `'scoped'`. This method is kept only for plugins that have not migrated:
without `lifecycle` declared, the host calls it once more **after** releasing the plugin's scope.

Per the repository's deprecation cycle, this member stays for at least one minor version (after 1.0, one major version cycle); removal happens in a breaking
version and is recorded in the migration docs. Until then the calling contract is unchanged — migrated plugins just delete it,
and dual-version plugins keeping it will not be cleaned up twice.

---

### install() \{#install\}

```ts
install(scope): void | Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-plugin.ts:175](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L175)

Installs the plugin.

#### Parameters

| Parameter | Type                                                      | Description                                                                                                             |
| --------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `scope`   | [`LifecycleScope`](../../utils/classes/LifecycleScope.md) | The plugin activation scope of this connection epoch; one `acquire()` wraps exactly one acquisition step that may throw |

#### Returns

`void` \| `Promise`&lt;`void`&gt;

#### Remarks

Throwing (including a `Promise` rejection) counts as an installation failure: the host first releases **the parts already registered on `scope`**
in reverse order, then propagates the original error to `connect()`. Cleanup errors during the rollback are only logged, never covering up the installation error.

Implementations omitting the parameter do not break the contract — `install()` and `install(scope)` both satisfy this interface.
