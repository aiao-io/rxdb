# RxDBPluginStorage

Defined in: [packages/rxdb-plugin-storage/src/plugin.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/plugin.ts#L24)

The plugin lifecycle object that installs [RxdbFileStorage](RxdbFileStorage.md)
into a single RxDB instance.

## Remarks

Each of the three host mutations takes one scope entry — creating the service,
mounting `rxdb.storage`, and registering the metadata entity — and they are
unwound in reverse order on disconnect: detach the entity first, then the
property, and finally wait for the storage to drain. Before the rework these
three things were scattered across the constructor, `install()`, and
`destroy()`, reconciled by the two booleans `#ownsStorage` / `#registeredEntity`;
now the manifest lives in the scope and the plugin no longer keeps track itself.

The service only exists **while connected**: `storage` is `undefined` both
before install and after teardown.

## Extends

- [`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md)

## Implements

- [`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md)

## Constructors

### Constructor

```ts
new RxDBPluginStorage(rxdb, options?): RxDBPluginStorage;
```

Defined in: [packages/rxdb-plugin-storage/src/plugin.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/plugin.ts#L38)

Creates the storage plugin lifecycle object.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) |
| `options?` | [`RxDBStoragePluginOptions`](../interfaces/RxDBStoragePluginOptions.md) |

#### Returns

`RxDBPluginStorage`

#### Overrides

[`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md).[`constructor`](../../rxdb/classes/RxDBPluginBase.md#constructor)

## Properties

### lifecycle \{#lifecycle\}

```ts
readonly lifecycle: "scoped";
```

Defined in: [packages/rxdb-plugin-storage/src/plugin.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/plugin.ts#L28)

Migrated to scope teardown; the host no longer calls `destroy()`.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`lifecycle`](../../rxdb/interfaces/IRxDBPlugin.md#lifecycle)

***

### name \{#name\}

```ts
readonly name: "storage";
```

Defined in: [packages/rxdb-plugin-storage/src/plugin.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/plugin.ts#L30)

The unique name of the RxDB plugin.

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

## Accessors

### storage \{#storage\}

#### Get Signature

```ts
get storage(): RxdbFileStorage | undefined;
```

Defined in: [packages/rxdb-plugin-storage/src/plugin.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/plugin.ts#L33)

The file storage service of the current connection epoch; `undefined` before
install and after teardown.

##### Returns

[`RxdbFileStorage`](RxdbFileStorage.md) \| `undefined`

## Methods

### install() \{#install\}

```ts
install(scope): void;
```

Defined in: [packages/rxdb-plugin-storage/src/plugin.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/plugin.ts#L44)

Creates the service, mounts `rxdb.storage`, and registers the metadata entity,
with each of the three steps registering its own undo entry.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `scope` | [`LifecycleScope`](../../utils/classes/LifecycleScope.md) |

#### Returns

`void`

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`install`](../../rxdb/interfaces/IRxDBPlugin.md#install)
