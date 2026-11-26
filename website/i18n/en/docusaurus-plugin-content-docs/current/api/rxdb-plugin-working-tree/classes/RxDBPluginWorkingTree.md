# RxDBPluginWorkingTree

Defined in: [packages/rxdb-plugin-working-tree/src/plugin.ts:221](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/plugin.ts#L221)

The plugin lifecycle object that installs the working tree and commit history onto a single RxDB instance.

## Remarks

Every shape difference from plugins like `@aiao/rxdb-plugin-storage` comes down to **timing**: storage's
services are connection-scoped resources (it holds OPFS handles), so all three of its concerns are registered
in the scope and torn down in reverse order on disconnect; the entry point this plugin mounts is a property of
the in-process library version, and the contributed tables must be in place before the moment of table creation —
both precede `install()`, and neither carries a symmetric teardown obligation. The only thing that really lives
in the scope is the cross-connection capability-enable listener (see [RxDBPluginWorkingTree.install](#install)).

## Extends

- [`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md)

## Implements

- [`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md)

## Constructors

### Constructor

```ts
new RxDBPluginWorkingTree(rxdb, options?): RxDBPluginWorkingTree;
```

Defined in: [packages/rxdb-plugin-working-tree/src/plugin.ts:265](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/plugin.ts#L265)

Builds the plugin object and mounts `rxdb.workingTree` onto it.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) | The host instance |
| `options?` | [`RxDBPluginWorkingTreeOptions`](../interfaces/RxDBPluginWorkingTreeOptions.md) | The plugin options; `worktrees` is for read-only worktrees |

#### Returns

`RxDBPluginWorkingTree`

#### Remarks

Mounting happens in the **constructor** rather than `install()`: inside `use()` the plugin factory is
evaluated synchronously, so the entry point exists from the moment of `use()`, earlier than `init()` /
`connect()`. `install()` runs inside `init()`, and mounting there would make "does the entry point exist"
a function of the connection epoch — while contracts/core-api.md §1 requires it to be a property of the
**in-process library version**. [WorkingTreeManager](WorkingTreeManager.md) itself holds no epoch resources
(the adapter is fetched fresh on every call), so the entry point is not torn down during the connection;
worktree claim locks are returned all at once by `instanceLifecycle` when the instance is disposed.

`configurable: false` / `writable: false`: subscriptions like `status$()` rely on the entry point's
**stable identity**; a redefinable property would let a second plugin instance swap it out from under the
subscribers. If the same instance already has one mounted, it is returned as-is — whoever installed it owns
it — the same rationale as the storage plugin's `hasOwnProperty` guard.

#### Overrides

[`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md).[`constructor`](../../rxdb/classes/RxDBPluginBase.md#constructor)

## Properties

### instanceLifecycle \{#instancelifecycle\}

```ts
readonly instanceLifecycle: object;
```

Defined in: [packages/rxdb-plugin-working-tree/src/plugin.ts:232](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/plugin.ts#L232)

Claim locks are kept across connections; on instance disposal they are returned after local transactions drain.

#### dispose

```ts
dispose: () => Promise<void>;
```

##### Returns

`Promise`&lt;`void`&gt;

#### stop

```ts
stop: () => void;
```

##### Returns

`void`

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`instanceLifecycle`](../../rxdb/interfaces/IRxDBPlugin.md#instancelifecycle)

***

### lifecycle \{#lifecycle\}

```ts
readonly lifecycle: "scoped";
```

Defined in: [packages/rxdb-plugin-working-tree/src/plugin.ts:229](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/plugin.ts#L229)

Migrated to scope teardown; the host no longer calls `destroy()`.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`lifecycle`](../../rxdb/interfaces/IRxDBPlugin.md#lifecycle)

***

### name \{#name\}

```ts
readonly name: "workingTree" = WORKING_TREE_CAPABILITY;
```

Defined in: [packages/rxdb-plugin-working-tree/src/plugin.ts:238](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/plugin.ts#L238)

The plugin's unique name within RxDB.

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

***

### system \{#system\}

```ts
readonly system: RxDBSystemContribution;
```

Defined in: [packages/rxdb-plugin-working-tree/src/plugin.ts:241](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/plugin.ts#L241)

The system-layer contribution; the host reads this field **synchronously** inside `use()`,
see [RxDBSystemContribution](../../rxdb/interfaces/RxDBSystemContribution.md).

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`system`](../../rxdb/interfaces/IRxDBPlugin.md#system)

## Methods

### install() \{#install\}

```ts
install(scope): void;
```

Defined in: [packages/rxdb-plugin-working-tree/src/plugin.ts:299](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/plugin.ts#L299)

Registers exactly one thing: the cross-connection capability-enable notification (FR-037).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `scope` | [`LifecycleScope`](../../utils/classes/LifecycleScope.md) | The activation scope of this connection epoch |

#### Returns

`void`

#### Remarks

The other three concerns are **not** here; each has its own timing:

- `rxdb.workingTree` is mounted **at construction** (see the constructor) and must precede `init()`;
- the 12 tables, initial rows, and bootstrap migration are declared via [RxDBPluginWorkingTree.system](#system)
  and orchestrated by the host at the moment of table creation — a contribution going through `install()`
  can never make it in time for its own tables (see [RxDBSystemContribution](../../rxdb/interfaces/RxDBSystemContribution.md));
- this connection's own bring-up is done by `bootstrapExisting()` (reading the capability bit on an existing
  database) and [WorkingTreeManager.enable](WorkingTreeManager.md#enable) (this connection just enabled it).

What is left for here is only the fourth permutation: **another connection enabled it, while this connection
was already up**. It lives here rather than in `bootstrapExisting()`, even though the adapter is right at hand
over there — because that hook **only runs on an existing database** (see the @remarks of
[RxDBSystemContribution.bootstrapExisting](../../rxdb/interfaces/RxDBSystemContribution.md#bootstrapexisting)).
Hanging the listener there would mean the client that created the database never receives it, and "A creates
the database, B connects, B enables" is exactly the permutation this channel exists to save.

Registered in the scope rather than hung bare: the listener points at **this epoch's** adapter resolution
path; if it leaked, the next epoch would have two listeners, each installing hooks onto its own generation.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`install`](../../rxdb/interfaces/IRxDBPlugin.md#install)
