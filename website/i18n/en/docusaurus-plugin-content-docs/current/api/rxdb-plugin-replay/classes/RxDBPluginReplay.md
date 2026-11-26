# RxDBPluginReplay

Defined in: [packages/rxdb-plugin-replay/src/plugin.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/plugin.ts#L26)

Main class of `@aiao/rxdb-plugin-replay`: creates one ReplayRuntime per connection epoch, and stops recording and destroys the recording database when the epoch is released.

## Remarks

Users interact with `rxdb.replay` ([ReplayManager](../interfaces/ReplayManager.md)), which is attached at the moment of `use()` and stays unchanged across epochs;
between epochs all members reject with `not_installed` — "the plugin is not installed" and "there is no session yet" are two different things and must not both return an empty array.

## Extends

- [`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md)

## Implements

- [`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md)

## Constructors

### Constructor

```ts
new RxDBPluginReplay(rxdb, options?): RxDBPluginReplay;
```

Defined in: [packages/rxdb-plugin-replay/src/plugin.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/plugin.ts#L41)

#### Parameters

| Parameter  | Type                                                      |
| ---------- | --------------------------------------------------------- |
| `rxdb`     | [`RxDB`](../../rxdb/classes/RxDB.md)                      |
| `options?` | [`RxDBReplayOptions`](../interfaces/RxDBReplayOptions.md) |

#### Returns

`RxDBPluginReplay`

#### Throws

`TypeError` / `RangeError`: invalid options (see resolveReplayOptions); in that case the plugin is not registered

#### Overrides

[`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md).[`constructor`](../../rxdb/classes/RxDBPluginBase.md#constructor)

## Properties

### inject \{#inject\}

```ts
readonly inject: readonly ["adapter:local"];
```

Defined in: [packages/rxdb-plugin-replay/src/plugin.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/plugin.ts#L31)

Only to align with the connection epoch: the plugin never reads from or writes to the recorded application database.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`inject`](../../rxdb/interfaces/IRxDBPlugin.md#inject)

---

### lifecycle \{#lifecycle\}

```ts
readonly lifecycle: "scoped";
```

Defined in: [packages/rxdb-plugin-replay/src/plugin.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/plugin.ts#L32)

Declares that this plugin has migrated to scope teardown.

#### Remarks

When the value is `'scoped'`, the host stops after releasing the plugin scope and does **not** call [IRxDBPlugin.destroy](../../rxdb/interfaces/IRxDBPlugin.md#destroy) anymore.
Dual-version plugins (which must install into both old and new hosts) write both: an old host does not recognize this field and only runs
`destroy()`; a new host recognizes it and only runs the scope, so neither side cleans up twice.

The reason for an explicit marker instead of checking whether `install.length` has parameters: transpiled output, `Function.prototype.bind`
and minifiers all rewrite the parameter count, so treating it as a contract leads to misjudgment.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`lifecycle`](../../rxdb/interfaces/IRxDBPlugin.md#lifecycle)

---

### manager \{#manager\}

```ts
readonly manager: ReplayManager;
```

Defined in: [packages/rxdb-plugin-replay/src/plugin.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/plugin.ts#L36)

The `rxdb.replay` facade.

---

### name \{#name\}

```ts
readonly name: "replay" = 'replay';
```

Defined in: [packages/rxdb-plugin-replay/src/plugin.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/plugin.ts#L29)

Plugin name, used for logging and host-side error attribution

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`name`](../../rxdb/interfaces/IRxDBPlugin.md#name)

---

### options \{#options\}

```ts
readonly options: ResolvedReplayOptions;
```

Defined in: [packages/rxdb-plugin-replay/src/plugin.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/plugin.ts#L34)

Options with defaults filled in and validated.

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

Defined in: [packages/rxdb-plugin-replay/src/plugin.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/plugin.ts#L48)

Installs the plugin.

#### Parameters

| Parameter | Type                                                      | Description                                                                                                      |
| --------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `scope`   | [`LifecycleScope`](../../utils/classes/LifecycleScope.md) | Plugin activation scope of this connection epoch; one `acquire()` wraps only one acquisition step that may throw |

#### Returns

`void`

#### Remarks

A throw (including a `Promise` rejection) counts as an installation failure: the host first releases the parts **already registered into `scope`**
in reverse order, then propagates the original error to `connect()`. Cleanup errors during the rollback are only logged and never mask the installation error.

Implementations may omit the parameter without breaking the contract — `install()` and `install(scope)` both satisfy this interface.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`install`](../../rxdb/interfaces/IRxDBPlugin.md#install)
