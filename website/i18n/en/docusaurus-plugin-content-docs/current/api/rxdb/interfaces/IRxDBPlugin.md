# IRxDBPlugin

Defined in: [packages/rxdb/src/rxdb-plugin.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L80)

RxDB plugin interface

## Remarks

In `install()`, a plugin receives a [LifecycleScope](../../utils/classes/LifecycleScope.md) **exclusive to this connection epoch**:
for every host change registered, it `acquire()`s one undo entry on the scope; on disconnect the host
releases them in reverse order, serially. Plugins therefore need no list of "what was installed, what to tear down" of their own,
and no terminal-state flag — the scope itself has the three states `active / disposing / disposed`.

The scope is **not reused across epochs**: after `disconnectAll()` and a new `connect()`, `install()`
receives a brand-new scope instance. Storing it on an instance field and reading it across epochs reads the old, released object.

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

Not declaring (or declaring an empty array) = no dependencies, installed immediately at `init()`, behavior exactly as before this field existed.

Once declared, the host owns the ordering; plugins **must not** wait again inside `install()`: the host's
`connect()` is itself waiting on plugin installation, and a plugin waiting back on `connect()` would self-deadlock. This is exactly
why the field exists — before it, the search plugin could only dodge the deadlock with the fragile ordering convention that
"`adapterConnected$` is set before plugin installation".

When dependencies are unsatisfied: the plugin is **not installed**, produces no scope, and does not enter the host's installation wait set, so
`connect()` resolves as usual instead of hanging; the host additionally emits one `console.warn` listing the missing items, not silent.

Dependencies are accounted by **instance reference**, not by name or a boolean bit. A same-name adapter swapping in a new instance (never empty in between)
also counts as an epoch change: the old scope is released, and the plugin reinstalls with the new instance and receives a brand-new child scope.
Conversely, an installation failure within the same epoch is **not** retried automatically — retries only happen when the epoch really changes.

Phase A only resolves `adapter:*`. Declaring `plugin:*` is syntactically legal for now, but the resolution result is always "not ready";
the plugin stays waiting and triggers the warn above — it does not silently vanish.

#### Example

```ts
readonly inject = ['adapter:local'] as const;

async install(scope: LifecycleScope) {
  // By this point adapter:local is definitely ready; just take it and use it
  const adapter = this.rxdb.localAdapterSync;
}
```

***

### instanceLifecycle? \{#instancelifecycle\}

```ts
readonly instanceLifecycle?: object;
```

Defined in: [packages/rxdb/src/rxdb-plugin.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L100)

Resources following the instance, finalized only on `RxDB.destroy()`; ordinary disconnects do not call them.

`stop` synchronously rejects new tasks; `dispose` releases resources after all adapters disconnect and in-flight transactions exit.
Both steps must be idempotent; a failure in one does not prevent the remaining plugins from finalizing.

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

Stops accepting tasks without waiting for in-flight transactions.

##### Returns

`void`

***

### lifecycle? \{#lifecycle\}

```ts
readonly lifecycle?: "scoped";
```

Defined in: [packages/rxdb/src/rxdb-plugin.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L92)

Declares that this plugin has migrated to scope teardown.

#### Remarks

With the value `'scoped'`, the host stops after releasing the plugin's scope and does **not** call [IRxDBPlugin.destroy](#destroy).
Dual-version plugins (installable into both old and new hosts) write both: old hosts do not know this field and only run
`destroy()`; new hosts know it and only run the scope, so neither side cleans up twice.

An explicit marker is required rather than checking whether `install.length` has a parameter: transpiled output, `Function.prototype.bind`
and minifiers all rewrite parameter counts, so treating it as a contract would misjudge.

***

### name \{#name\}

```ts
name: Uncapitalize<string>;
```

Defined in: [packages/rxdb/src/rxdb-plugin.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L108)

The plugin name, used for logging and host-side error attribution

***

### system? \{#system\}

```ts
readonly system?: RxDBSystemContribution;
```

Defined in: [packages/rxdb/src/rxdb-plugin.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L121)

This plugin's contribution to the system layer: system entities, initial rows, system migrations and capability claims.

#### Remarks

The host reads this field **synchronously** in `use()`, before any adapter action — it cannot go through [IRxDBPlugin.install](#install);
see the `@fileoverview` of [RxDBSystemContribution](RxDBSystemContribution.md) (plugins declaring `inject` necessarily run after
table creation, while system tables must come out in the same batch as the table creation).

Plugins carrying this field must be `use()`d before `connect()`: too late, and the host **throws** instead of silently skipping.
The consequence of a silent skip is a database "with the plugin installed but the tables never created" — which produces no compile error.

***

### worktreeTableSet? \{#worktreetableset\}

```ts
readonly worktreeTableSet?: WorktreeTableSetHooks;
```

Defined in: [packages/rxdb/src/rxdb-plugin.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L129)

This plugin's contribution to the writable checkout's table set (US-314 B2.5); see [WorktreeTableSetHooks](WorktreeTableSetHooks.md).

#### Remarks

Only plugins that build auxiliary objects (such as full-text indexes) on business tables need to declare it.

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

Use `scope.acquire()` inside `install(scope)` to register undo entries instead, and declare
[IRxDBPlugin.lifecycle](#lifecycle) as `'scoped'`. This method is kept only for plugins that have not migrated:
when `lifecycle` is not declared, the host calls it once more **after** releasing the plugin's scope.

Per the repository's deprecation cycle, this member is kept for at least one minor version (one major-version cycle after 1.0); removal happens in a breaking
version and is recorded in the migration docs. Until then the calling contract is unchanged — migrated plugins can simply delete it,
and dual-version plugins keeping it are not cleaned up twice.

***

### install() \{#install\}

```ts
install(scope): void | Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-plugin.ts:175](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin.ts#L175)

Installs the plugin.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `scope` | [`LifecycleScope`](../../utils/classes/LifecycleScope.md) | The plugin activation scope of this connection epoch; one `acquire()` wraps only one acquisition step that may throw |

#### Returns

`void` \| `Promise`&lt;`void`&gt;

#### Remarks

Throwing (including `Promise` rejection) counts as an installation failure: the host first releases **the parts already registered into `scope`**
in reverse order, then propagates the original error to `connect()`. Cleanup errors during the rollback are only logged and never cover up the installation error.

Implementations omitting the parameter do not break the contract — `install()` and `install(scope)` both satisfy this interface.
