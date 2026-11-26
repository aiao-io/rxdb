# StorageFileMeta

Defined in: [packages/rxdb-plugin-storage/src/file-meta.entity.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/file-meta.entity.ts#L58)

The persisted metadata entity corresponding to an OPFS file.

## Extends

- [`EntityBase`](../../rxdb/classes/EntityBase.md)

## Constructors

### Constructor

```ts
new StorageFileMeta(initData?): StorageFileMeta;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:117

Entity base class constructor
Subclasses enhance this constructor via the Entity decorator

#### Parameters

| Parameter   | Type      |
| ----------- | --------- |
| `initData?` | `unknown` |

#### Returns

`StorageFileMeta`

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`constructor`](../../rxdb/classes/EntityBase.md#constructor)

## Properties

### contentVersion \{#contentversion\}

```ts
contentVersion: number;
```

Defined in: [packages/rxdb-plugin-storage/src/file-meta.entity.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/file-meta.entity.ts#L68)

The version number incremented after every successful overwrite of the content at the same path.

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
Records the user ID that created this entity

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`createdBy`](../../rxdb/classes/EntityBase.md#createdby)

---

### id \{#id\}

```ts
readonly id: `${string}-${string}-${string}-${string}-${string}`;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:31

Entity unique identifier
An automatically generated UUID, used as the primary key

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`id`](../../rxdb/classes/EntityBase.md#id)

---

### mimeType \{#mimetype\}

```ts
mimeType: string;
```

Defined in: [packages/rxdb-plugin-storage/src/file-meta.entity.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/file-meta.entity.ts#L62)

The MIME type of the file content.

---

### name \{#name\}

```ts
name: string;
```

Defined in: [packages/rxdb-plugin-storage/src/file-meta.entity.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/file-meta.entity.ts#L60)

The user-visible file name.

---

### opfsPath \{#opfspath\}

```ts
opfsPath: string;
```

Defined in: [packages/rxdb-plugin-storage/src/file-meta.entity.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/file-meta.entity.ts#L66)

The unique path relative to the plugin's OPFS root directory.

---

### remove \{#remove\}

```ts
remove: () => Promise<StorageFileMeta>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:97

Remove

#### Returns

`Promise`&lt;`StorageFileMeta`&gt;

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
save: () => Promise<StorageFileMeta>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:110

Saves the entity.

#### Returns

`Promise`&lt;`StorageFileMeta`&gt;

#### Remarks

This entry does not hold a transaction executor and re-enters the adapter queue.
Awaiting this method inside a transaction callback waits for the current
transaction to finish; use [TransactionExecutor.getRepository](../../rxdb/interfaces/TransactionExecutor.md#getrepository)
instead. See [RxDBAdapterLocalBase.transaction](../../rxdb/classes/RxDBAdapterLocalBase.md#transaction)
for full positive and negative examples.

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`save`](../../rxdb/classes/EntityBase.md#save)

---

### size \{#size\}

```ts
size: number;
```

Defined in: [packages/rxdb-plugin-storage/src/file-meta.entity.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/file-meta.entity.ts#L64)

The file size in bytes.

---

### updatedAt \{#updatedat\}

```ts
readonly updatedAt: Date;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:41

Update time
Automatically set to the current time when the entity is created or updated

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`updatedAt`](../../rxdb/classes/EntityBase.md#updatedat)

---

### updatedBy? \{#updatedby\}

```ts
readonly updatedBy?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:51

Updater ID
Records the user ID that last updated this entity

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

| Parameter | Type                                                                         | Description                               |
| --------- | ---------------------------------------------------------------------------- | ----------------------------------------- |
| `this`    | new () => `T`                                                                | -                                         |
| `options` | [`CountOptions`](../../rxdb/interfaces/CountOptions.md)&lt;new () => `T`&gt; | Query options, including where conditions |

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

| Parameter | Type                                                                       | Description                                                    |
| --------- | -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `this`    | new () => `T`                                                              | -                                                              |
| `options` | [`FindOptions`](../../rxdb/interfaces/FindOptions.md)&lt;new () => `T`&gt; | Query options, including where conditions, limit, offset, etc. |

#### Returns

`Observable`&lt;`T`[]&gt;

The entity instance array wrapped in an Observable

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

| Parameter | Type                                                                             | Description                                                                |
| --------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `this`    | new () => `T`                                                                    | -                                                                          |
| `options` | [`FindAllOptions`](../../rxdb/interfaces/FindAllOptions.md)&lt;new () => `T`&gt; | Query options, including where conditions and ordering (no quantity limit) |

#### Returns

`Observable`&lt;`T`[]&gt;

The entity instance array wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`findAll`](../../rxdb/classes/EntityBase.md#findall)

---

### findByCursor \{#findbycursor\}

```ts
static findByCursor: <T>(this, options) => Observable<T[]>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:87

Paginated queries via a cursor

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                                       | Description                                                           |
| --------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `this`    | new () => `T`                                                                              | -                                                                     |
| `options` | [`FindByCursorOptions`](../../rxdb/interfaces/FindByCursorOptions.md)&lt;new () => `T`&gt; | Cursor pagination options, including orderBy and before/after cursors |

#### Returns

`Observable`&lt;`T`[]&gt;

The entity instance array wrapped in an Observable

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

| Parameter | Type                                                                             | Description                               |
| --------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| `this`    | new () => `T`                                                                    | -                                         |
| `options` | [`FindOneOptions`](../../rxdb/interfaces/FindOneOptions.md)&lt;new () => `T`&gt; | Query options, including where conditions |

#### Returns

`Observable`&lt;`T` \| `null`&gt;

The entity instance or null, wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`findOne`](../../rxdb/classes/EntityBase.md#findone)

---

### findOneOrFail \{#findoneorfail\}

```ts
static findOneOrFail: <T>(this, options) => Observable<T>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:69

Finds one entity, throwing an error when none is found

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                                         | Description                               |
| --------- | -------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `this`    | new () => `T`                                                                                | -                                         |
| `options` | [`FindOneOrFailOptions`](../../rxdb/interfaces/FindOneOrFailOptions.md)&lt;new () => `T`&gt; | Query options, including where conditions |

#### Returns

`Observable`&lt;`T`&gt;

The entity instance wrapped in an Observable

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

| Parameter | Type          | Description                         |
| --------- | ------------- | ----------------------------------- |
| `this`    | new () => `T` | -                                   |
| `id`      | `T`\[`"id"`\] | The unique identifier of the entity |

#### Returns

`Observable`&lt;`T`&gt;

The entity instance wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`get`](../../rxdb/classes/EntityBase.md#get)
