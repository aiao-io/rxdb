# RxDBPluginWorkingTree

Defined in: [packages/rxdb-plugin-working-tree/src/plugin.ts:221](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/plugin.ts#L221)

The plugin lifecycle object that installs the working tree and commit history on a single RxDB instance.

## Remarks

All the shape differences from plugins like `@aiao/rxdb-plugin-storage` come from **timing**: storage's services are connection-epoch
resources (it holds OPFS handles), so all three things are registered in the scope and torn down in reverse order on disconnect; the entry this plugin mounts is
a property of the in-process database version, and the tables it contributes must be in place before the moment tables are created — both are earlier than `install()`, and neither has
a symmetric teardown obligation. The only thing that really lands in the scope is the cross-connection capability-enabled listener (see [RxDBPluginWorkingTree.install](#install)).

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

Builds the plugin object and mounts `rxdb.workingTree`.

#### Parameters

| Parameter  | Type                                                                            | Description                                            |
| ---------- | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `rxdb`     | [`RxDB`](../../rxdb/classes/RxDB.md)                                            | The host instance                                      |
| `options?` | [`RxDBPluginWorkingTreeOptions`](../interfaces/RxDBPluginWorkingTreeOptions.md) | Plugin options; `worktrees` is for read-only checkouts |

#### Returns

`RxDBPluginWorkingTree`

#### Remarks

The mount lives in the **constructor** rather than `install()`: in `use()` the plugin factory is evaluated synchronously, so the entry exists from the moment of `use()`,
earlier than `init()` / `connect()`. Mounting it in `install()` — which runs inside `init()` — would make
"does the entry exist" a function of the connection epoch, while contracts/core-api.md §1 requires it to be a property of the **in-process database version**.
[WorkingTreeManager](WorkingTreeManager.md) itself holds no epoch resources (the adapter is fetched per call),
so the entry is not torn down during the connection; checkout claim locks are returned uniformly by `instanceLifecycle` when the instance is destroyed.

`configurable: false` / `writable: false`: subscriptions like `status$()` rely on the **stable identity** of the entry,
and a redefinable property would let a second plugin instance swap it out behind the subscribers. If it is already mounted on the same instance, just return —
whoever installed it owns it — the same reason as the storage plugin's `hasOwnProperty` guard.

#### Overrides

[`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md).[`constructor`](../../rxdb/classes/RxDBPluginBase.md#constructor)

## Properties

### instanceLifecycle \{#instancelifecycle\}

```ts
readonly instanceLifecycle: object;
```

Defined in: [packages/rxdb-plugin-working-tree/src/plugin.ts:232](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/plugin.ts#L232)

Claim locks survive across connections and are returned after local transactions exit when the instance is destroyed.

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

---

### lifecycle \{#lifecycle\}

```ts
readonly lifecycle: "scoped";
```

Defined in: [packages/rxdb-plugin-working-tree/src/plugin.ts:229](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/plugin.ts#L229)

Migrated to scope-based teardown; the host no longer calls `destroy()`.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`lifecycle`](../../rxdb/interfaces/IRxDBPlugin.md#lifecycle)

---

### name \{#name\}

```ts
readonly name: "workingTree" = WORKING_TREE_CAPABILITY;
```

Defined in: [packages/rxdb-plugin-working-tree/src/plugin.ts:238](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/plugin.ts#L238)

Unique name of the RxDB plugin.

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

---

### system \{#system\}

```ts
readonly system: RxDBSystemContribution;
```

Defined in: [packages/rxdb-plugin-working-tree/src/plugin.ts:241](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/plugin.ts#L241)

System-layer contribution; the host reads this field **synchronously** in `use()`, see [RxDBSystemContribution](../../rxdb/interfaces/RxDBSystemContribution.md).

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`system`](../../rxdb/interfaces/IRxDBPlugin.md#system)

## Methods

### install() \{#install\}

```ts
install(scope): void;
```

Defined in: [packages/rxdb-plugin-working-tree/src/plugin.ts:299](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/plugin.ts#L299)

Registers exactly one thing: the cross-connection capability-enabled notification (FR-037).

#### Parameters

| Parameter | Type                                                      | Description                                   |
| --------- | --------------------------------------------------------- | --------------------------------------------- |
| `scope`   | [`LifecycleScope`](../../utils/classes/LifecycleScope.md) | The activation scope of this connection epoch |

#### Returns

`void`

#### Remarks

The other three things are **not** here; each has its own timing:

- `rxdb.workingTree` is mounted at **construction time** (see the constructor), and must be earlier than `init()`;
- the 12 tables, initial rows, and bootstrap migrations are declared via [RxDBPluginWorkingTree.system](#system) and orchestrated by the host at the moment of table
  creation — a contribution that goes through `install()` can never catch up with its own tables (see [RxDBSystemContribution](../../rxdb/interfaces/RxDBSystemContribution.md));
- this connection's own wiring is done by `bootstrapExisting()` (reads the capability bit of an existing database) and
  [WorkingTreeManager.enable](WorkingTreeManager.md#enable) (this connection just enabled it).

What remains here is only the fourth arrangement: **another connection enabled it, while this connection has long been connected**. It lands here rather than in
`bootstrapExisting()`, even though an adapter is right at hand there — because that hook **only runs on existing databases**
(see the @remarks of [RxDBSystemContribution.bootstrapExisting](../../rxdb/interfaces/RxDBSystemContribution.md#bootstrapexisting)). Mounting the listener there
would mean the client that creates the database never receives it once, and "A creates the database, B connects, B enables" is exactly the arrangement this channel most needs to rescue.

Registered in the scope rather than mounted bare: the listener points at the adapter resolution path of **this epoch**; if it leaked, the next epoch would have
two listeners, each installing hooks onto its own generation.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`install`](../../rxdb/interfaces/IRxDBPlugin.md#install)
