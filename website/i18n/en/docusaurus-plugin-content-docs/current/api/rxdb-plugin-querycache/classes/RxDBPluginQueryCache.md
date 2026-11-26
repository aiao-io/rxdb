# RxDBPluginQueryCache

Defined in: [rxdb-plugin-querycache/src/plugin.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-querycache/src/plugin.ts#L23)

QueryCache read engine plugin.

## Remarks

**Declares no `inject`**: registering the factory is a pure action and needs no adapter ready. Declaring a dependency would instead push installation behind the `connect()` startup guard — that guard specifically checks for "QueryCache declared but no engine installed", and installing too late would turn into a false positive.

## Extends

- [`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md)

## Implements

- [`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md)

## Constructors

### Constructor

```ts
new RxDBPluginQueryCache(rxdb): RxDBPluginQueryCache;
```

Defined in: rxdb/dist/rxdb-plugin.d.ts:184

#### Parameters

| Parameter | Type                                 |
| --------- | ------------------------------------ |
| `rxdb`    | [`RxDB`](../../rxdb/classes/RxDB.md) |

#### Returns

`RxDBPluginQueryCache`

#### Inherited from

[`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md).[`constructor`](../../rxdb/classes/RxDBPluginBase.md#constructor)

## Properties

### lifecycle \{#lifecycle\}

```ts
readonly lifecycle: "scoped";
```

Defined in: [rxdb-plugin-querycache/src/plugin.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-querycache/src/plugin.ts#L24)

Declares that this plugin has migrated to scope teardown.

#### Remarks

When set to `'scoped'`, the host stops after releasing the plugin scope and no longer calls [IRxDBPlugin.destroy](../../rxdb/interfaces/IRxDBPlugin.md#destroy). Dual-version plugins (must work in both old and new hosts) implement both: the old host doesn't know this field and only runs `destroy()`; the new host knows it and only runs the scope path — neither side cleans up twice.

Why an explicit marker instead of checking whether `install.length` has a parameter: transpiled output, `Function.prototype.bind`, and minifiers all rewrite the parameter count; treating it as a contract would misjudge.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`lifecycle`](../../rxdb/interfaces/IRxDBPlugin.md#lifecycle)

---

### name \{#name\}

```ts
name: Uncapitalize<string> = 'queryCache';
```

Defined in: [rxdb-plugin-querycache/src/plugin.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-querycache/src/plugin.ts#L25)

Plugin name, used for logging and host-side error attribution

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`name`](../../rxdb/interfaces/IRxDBPlugin.md#name)

---

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

Defined in: [rxdb-plugin-querycache/src/plugin.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-querycache/src/plugin.ts#L27)

Installs the plugin.

#### Parameters

| Parameter | Type                                                      | Description                                                                                                             |
| --------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `scope`   | [`LifecycleScope`](../../utils/classes/LifecycleScope.md) | Plugin activation scope for this connection epoch; one `acquire()` wraps only one step of possibly-throwing acquisition |

#### Returns

`void`

#### Remarks

Thrown errors (including `Promise` rejections) count as install failure: the host first releases what has already been registered into the `scope` in reverse order, then propagates the original error to `connect()`. Cleanup errors during rollback are only logged and never mask the install error.

Implementations that omit the parameter do not break the contract — `install()` and `install(scope)` both satisfy this interface.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`install`](../../rxdb/interfaces/IRxDBPlugin.md#install)
