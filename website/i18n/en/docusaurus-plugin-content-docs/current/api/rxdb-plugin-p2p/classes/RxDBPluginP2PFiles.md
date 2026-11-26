# RxDBPluginP2PFiles

Defined in: [packages/rxdb-plugin-p2p/src/plugin.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/plugin.ts#L15)

P2P plugin shell: registers the manifest entity into this instance's configuration on `use()`.

## Remarks

The entity is only bound and its table created during `init()` (the first step of `connect()`), so registration must happen before it, and cannot go into `install()`:
when `init()` fails and is retried immediately, installation is deferred until the previous epoch finishes releasing, by which time the entity is already bound.
The entity stays in this instance's configuration and is reused across connection epochs; on disconnect the entity manager unbinds it according to the binding record.

## Extends

- [`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md)

## Implements

- [`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md)

## Constructors

### Constructor

```ts
new RxDBPluginP2PFiles(rxdb): RxDBPluginP2PFiles;
```

Defined in: [packages/rxdb-plugin-p2p/src/plugin.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/plugin.ts#L25)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) | The database instance to register the manifest entity into |

#### Returns

`RxDBPluginP2PFiles`

#### Throws

Error The instance has already `init()`'d (`connect()` has already been called)

#### Overrides

[`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md).[`constructor`](../../rxdb/classes/RxDBPluginBase.md#constructor)

## Properties

### lifecycle \{#lifecycle\}

```ts
readonly lifecycle: "scoped";
```

Defined in: [packages/rxdb-plugin-p2p/src/plugin.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/plugin.ts#L17)

Scoped lifecycle: no `destroy()` required.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`lifecycle`](../../rxdb/interfaces/IRxDBPlugin.md#lifecycle)

***

### name \{#name\}

```ts
name: Uncapitalize<string> = 'p2pFiles';
```

Defined in: [packages/rxdb-plugin-p2p/src/plugin.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/plugin.ts#L19)

The plugin name.

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

## Methods

### install() \{#install\}

```ts
install(): void;
```

Defined in: [packages/rxdb-plugin-p2p/src/plugin.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/plugin.ts#L35)

The manifest entity is already registered on `use()`; no resources are created during a connection.

#### Returns

`void`

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`install`](../../rxdb/interfaces/IRxDBPlugin.md#install)
