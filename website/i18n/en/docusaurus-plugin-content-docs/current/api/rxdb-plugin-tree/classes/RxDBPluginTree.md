# RxDBPluginTree

Defined in: [rxdb-plugin-tree/src/plugin.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/plugin.ts#L44)

The tree structure plugin.

## Remarks

It does exactly one thing: registers [TreeRepository](TreeRepository.md) in `rxdb`'s repository registry and declares that it cannot support `SyncType.QueryCache`. Registration is **scoped** — it is revoked together with the scope when the connection is torn down, so no repository pointing at a dismantled epoch is left on `rxdb`.

The four tree queries (`findDescendants` / `countDescendants` / `findAncestors` / `countAncestors`) and their incremental merges all live on `TreeRepository`; applications without this plugin do not even have these four in `QueryOptions`.

Generally not `new`ed directly — use the factory [rxDBPluginTree](../variables/rxDBPluginTree.md) and pass it to `.use()`.

## Example

```typescript
import { rxDBPluginTree } from '@aiao/rxdb-plugin-tree';

const rxdb = new RxDB({ entities: [Category] }).use(rxDBPluginTree);
```

## Extends

- [`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md)

## Implements

- [`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md)

## Constructors

### Constructor

```ts
new RxDBPluginTree(rxdb): RxDBPluginTree;
```

Defined in: rxdb/dist/rxdb-plugin.d.ts:184

#### Parameters

| Parameter | Type                                 |
| --------- | ------------------------------------ |
| `rxdb`    | [`RxDB`](../../rxdb/classes/RxDB.md) |

#### Returns

`RxDBPluginTree`

#### Inherited from

[`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md).[`constructor`](../../rxdb/classes/RxDBPluginBase.md#constructor)

## Properties

### lifecycle \{#lifecycle\}

```ts
readonly lifecycle: "scoped";
```

Defined in: [rxdb-plugin-tree/src/plugin.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/plugin.ts#L45)

Declares that this plugin has migrated to scope-based teardown.

#### Remarks

When the value is `'scoped'`, the host stops after releasing the plugin's scope and **no longer** calls [IRxDBPlugin.destroy](../../rxdb/interfaces/IRxDBPlugin.md#destroy). Dual-version plugins (that must install into both old and new hosts) implement both: an old host does not recognize this field and only calls `destroy()`; a new host recognizes it and only releases the scope — neither side cleans up twice.

The reason this is an explicit marker rather than checking whether `install.length` has a parameter: transpiled output, `Function.prototype.bind` and minifiers all rewrite parameter counts, so treating it as a contract would misjudge.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`lifecycle`](../../rxdb/interfaces/IRxDBPlugin.md#lifecycle)

---

### name \{#name\}

```ts
name: Uncapitalize<string> = 'tree';
```

Defined in: [rxdb-plugin-tree/src/plugin.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/plugin.ts#L46)

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

Defined in: [rxdb-plugin-tree/src/plugin.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/plugin.ts#L48)

Installs the plugin.

#### Parameters

| Parameter | Type                                                      | Description                                                                                                           |
| --------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `scope`   | [`LifecycleScope`](../../utils/classes/LifecycleScope.md) | Plugin activation scope of the current connection epoch; one `acquire()` wraps only one possibly-throwing acquisition |

#### Returns

`void`

#### Remarks

A throw (including a `Promise` rejection) counts as a failed install: the host first releases, in reverse order, **the parts already registered on `scope`**, then propagates the original error to `connect()`. Cleanup errors during rollback are only logged and never mask the install error.

Implementations that omit the parameter do not break the contract — `install()` and `install(scope)` both satisfy this interface.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`install`](../../rxdb/interfaces/IRxDBPlugin.md#install)
