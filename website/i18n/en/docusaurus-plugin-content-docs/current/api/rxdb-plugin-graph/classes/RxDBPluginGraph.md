# RxDBPluginGraph

Defined in: [rxdb-plugin-graph/src/plugin.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/plugin.ts#L16)

RxDB plugin interface

## Remarks

Inside `install()`, the plugin receives a [LifecycleScope](../../utils/classes/LifecycleScope.md) **dedicated to this connection epoch**: for every host change registered, one revocation entry is `acquire()`d on the scope; on disconnect the host releases them serially in reverse order. The plugin therefore needs no list of its own of "what was installed, what to tear down", and no terminal-state marker — the scope itself has the three states `active / disposing / disposed`.

The scope is **not reused across epochs**: after `disconnectAll()`, a re-`connect()` passes a brand-new scope instance to `install()`. Storing it on an instance field and reading it across epochs yields an already-released old object.

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

## Extends

- [`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md)

## Implements

- [`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md)

## Constructors

### Constructor

```ts
new RxDBPluginGraph(rxdb): RxDBPluginGraph;
```

Defined in: rxdb/dist/rxdb-plugin.d.ts:184

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) |

#### Returns

`RxDBPluginGraph`

#### Inherited from

[`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md).[`constructor`](../../rxdb/classes/RxDBPluginBase.md#constructor)

## Properties

### lifecycle \{#lifecycle\}

```ts
readonly lifecycle: "scoped";
```

Defined in: [rxdb-plugin-graph/src/plugin.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/plugin.ts#L17)

Declares that this plugin has migrated to scope-based teardown.

#### Remarks

When the value is `'scoped'`, the host stops after releasing the plugin's scope and **no longer** calls [IRxDBPlugin.destroy](../../rxdb/interfaces/IRxDBPlugin.md#destroy). Dual-version plugins (that must install into both old and new hosts) implement both: an old host does not recognize this field and only calls `destroy()`; a new host recognizes it and only releases the scope — neither side cleans up twice.

The reason this is an explicit marker rather than checking whether `install.length` has a parameter: transpiled output, `Function.prototype.bind` and minifiers all rewrite parameter counts, so treating it as a contract would misjudge.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`lifecycle`](../../rxdb/interfaces/IRxDBPlugin.md#lifecycle)

***

### name \{#name\}

```ts
name: Uncapitalize<string> = 'graph';
```

Defined in: [rxdb-plugin-graph/src/plugin.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/plugin.ts#L18)

Plugin name, used for logging and host-side error attribution

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`name`](../../rxdb/interfaces/IRxDBPlugin.md#name)

***

### rxdb \{#rxdb\}

```ts
protected readonly rxdb: RxDB;
```

Defined in: rxdb/dist/rxdb-plugin.d.ts:183

#### Inherited from

[`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md).[`rxdb`](../../rxdb/classes/RxDBPluginBase.md#rxdb)

## Methods

### install() \{#install\}

```ts
install(scope): void;
```

Defined in: [rxdb-plugin-graph/src/plugin.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-graph/src/plugin.ts#L20)

Installs the plugin.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `scope` | [`LifecycleScope`](../../utils/classes/LifecycleScope.md) | Plugin activation scope of the current connection epoch; one `acquire()` wraps only one possibly-throwing acquisition |

#### Returns

`void`

#### Remarks

A throw (including a `Promise` rejection) counts as a failed install: the host first releases, in reverse order, **the parts already registered on `scope`**, then propagates the original error to `connect()`. Cleanup errors during rollback are only logged and never mask the install error.

Implementations that omit the parameter do not break the contract — `install()` and `install(scope)` both satisfy this interface.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`install`](../../rxdb/interfaces/IRxDBPlugin.md#install)
