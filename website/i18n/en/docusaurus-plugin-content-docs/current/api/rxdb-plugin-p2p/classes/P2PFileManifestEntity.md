# P2PFileManifestEntity

Defined in: [packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts#L24)

A P2P holder record replicated via sync; file bytes still travel over the P2P channel.

## Extends

- [`EntityBase`](../../rxdb/classes/EntityBase.md)

## Constructors

### Constructor

```ts
new P2PFileManifestEntity(initData?): P2PFileManifestEntity;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:117

Entity base class constructor
Subclasses augment this constructor through the Entity decorator

#### Parameters

| Parameter   | Type      |
| ----------- | --------- |
| `initData?` | `unknown` |

#### Returns

`P2PFileManifestEntity`

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`constructor`](../../rxdb/classes/EntityBase.md#constructor)

## Properties

### chunkHashes \{#chunkhashes\}

```ts
chunkHashes: string[];
```

Defined in: [packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts#L34)

SHA-256 of each chunk, in chunk order.

---

### chunkSize \{#chunksize\}

```ts
chunkSize: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts#L32)

Fixed chunk size.

---

### contentHash \{#contenthash\}

```ts
contentHash: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts#L26)

SHA-256 of the whole file (lowercase hex).

---

### createdAt \{#createdat\}

```ts
readonly createdAt: Date;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:36

Creation time
Automatically set to the current time when the entity is created

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`createdAt`](../../rxdb/classes/EntityBase.md#createdat)

---

### createdBy? \{#createdby\}

```ts
readonly createdBy?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:46

Creator ID
Records the ID of the user who created this entity

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`createdBy`](../../rxdb/classes/EntityBase.md#createdby)

---

### fileName \{#filename\}

```ts
fileName: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts#L28)

File name for display.

---

### holderId \{#holderid\}

```ts
holderId: string;
```

Defined in: [packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts#L38)

Holder ID derived from the authenticated principal and device.

---

### id \{#id\}

```ts
readonly id: `${string}-${string}-${string}-${string}-${string}`;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:31

Entity unique identifier
An auto-generated UUID used as the primary key

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`id`](../../rxdb/classes/EntityBase.md#id)

---

### remove \{#remove\}

```ts
remove: () => Promise<P2PFileManifestEntity>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:97

Delete

#### Returns

`Promise`&lt;`P2PFileManifestEntity`&gt;

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`remove`](../../rxdb/classes/EntityBase.md#remove)

---

### reset \{#reset\}

```ts
reset: () => void;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:101

Reset data

#### Returns

`void`

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`reset`](../../rxdb/classes/EntityBase.md#reset)

---

### save \{#save\}

```ts
save: () => Promise<P2PFileManifestEntity>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:110

Saves the entity.

#### Returns

`Promise`&lt;`P2PFileManifestEntity`&gt;

#### Remarks

This entry does not hold a transaction executor and re-enters the adapter queue.
Awaiting this method inside a transaction callback waits for the current transaction to finish; use [TransactionExecutor.getRepository](../../rxdb/interfaces/TransactionExecutor.md#getrepository) instead.
See [RxDBAdapterLocalBase.transaction](../../rxdb/classes/RxDBAdapterLocalBase.md#transaction) for full positive and negative examples.

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`save`](../../rxdb/classes/EntityBase.md#save)

---

### size \{#size\}

```ts
size: number;
```

Defined in: [packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts#L30)

File size in bytes.

---

### sourceUrl \{#sourceurl\}

```ts
sourceUrl: string | null;
```

Defined in: [packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts#L36)

Server fallback download URL; null when absent.

---

### updatedAt \{#updatedat\}

```ts
readonly updatedAt: Date;
```

Defined in: [packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-p2p/src/p2p-file-manifest.entity.ts#L40)

The EntityBase Date timestamp is the local time source for the manifest wire `updatedAt`.

#### Overrides

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`updatedAt`](../../rxdb/classes/EntityBase.md#updatedat)

---

### updatedBy? \{#updatedby\}

```ts
readonly updatedBy?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:51

Updater ID
Records the ID of the user who last updated this entity

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`updatedBy`](../../rxdb/classes/EntityBase.md#updatedby)

---

### count \{#count\}

```ts
static count: <T>(this, options) => Observable<number>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:93

Queries the number of entities

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                         | Description                                  |
| --------- | ---------------------------------------------------------------------------- | -------------------------------------------- |
| `this`    | new () => `T`                                                                | -                                            |
| `options` | [`CountOptions`](../../rxdb/interfaces/CountOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition |

#### Returns

`Observable`&lt;`number`&gt;

The count wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`count`](../../rxdb/classes/EntityBase.md#count)

---

### find \{#find\}

```ts
static find: <T>(this, options) => Observable<T[]>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:75

Queries multiple entities

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                       | Description                                                       |
| --------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `this`    | new () => `T`                                                              | -                                                                 |
| `options` | [`FindOptions`](../../rxdb/interfaces/FindOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition, limit, offset, etc. |

#### Returns

`Observable`&lt;`T`[]&gt;

Array of entity instances wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`find`](../../rxdb/classes/EntityBase.md#find)

---

### findAll \{#findall\}

```ts
static findAll: <T>(this, options) => Observable<T[]>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:81

Queries all entities

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                             | Description                                                          |
| --------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `this`    | new () => `T`                                                                    | -                                                                    |
| `options` | [`FindAllOptions`](../../rxdb/interfaces/FindAllOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition and ordering (no limit) |

#### Returns

`Observable`&lt;`T`[]&gt;

Array of entity instances wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`findAll`](../../rxdb/classes/EntityBase.md#findall)

---

### findByCursor \{#findbycursor\}

```ts
static findByCursor: <T>(this, options) => Observable<T[]>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:87

Paginated query via cursor

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                                       | Description                                                               |
| --------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `this`    | new () => `T`                                                                              | -                                                                         |
| `options` | [`FindByCursorOptions`](../../rxdb/interfaces/FindByCursorOptions.md)&lt;new () => `T`&gt; | Cursor pagination options, including orderBy and the before/after cursors |

#### Returns

`Observable`&lt;`T`[]&gt;

Array of entity instances wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`findByCursor`](../../rxdb/classes/EntityBase.md#findbycursor)

---

### findOne \{#findone\}

```ts
static findOne: <T>(this, options) => Observable<T | null>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:63

Finds one entity

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                             | Description                                  |
| --------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| `this`    | new () => `T`                                                                    | -                                            |
| `options` | [`FindOneOptions`](../../rxdb/interfaces/FindOneOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition |

#### Returns

`Observable`&lt;`T` \| `null`&gt;

An entity instance or null, wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`findOne`](../../rxdb/classes/EntityBase.md#findone)

---

### findOneOrFail \{#findoneorfail\}

```ts
static findOneOrFail: <T>(this, options) => Observable<T>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:69

Finds one entity and throws when none is found

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                                         | Description                                  |
| --------- | -------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `this`    | new () => `T`                                                                                | -                                            |
| `options` | [`FindOneOrFailOptions`](../../rxdb/interfaces/FindOneOrFailOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition |

#### Returns

`Observable`&lt;`T`&gt;

An entity instance wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`findOneOrFail`](../../rxdb/classes/EntityBase.md#findoneorfail)

---

### get \{#get\}

```ts
static get: <T>(this, id) => Observable<T>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:57

Gets an entity by id

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type          | Description                    |
| --------- | ------------- | ------------------------------ |
| `this`    | new () => `T` | -                              |
| `id`      | `T`\[`"id"`\] | The entity's unique identifier |

#### Returns

`Observable`&lt;`T`&gt;

An entity instance wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`get`](../../rxdb/classes/EntityBase.md#get)
