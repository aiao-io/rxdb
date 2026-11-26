# SqliteCoreKeyringStorage

Defined in: [packages/rxdb-adapter-sqlite-core/src/keyring/sqlite-core-keyring-storage.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/keyring/sqlite-core-keyring-storage.ts#L43)

Persists the single-row keyring into the adapter's own SQLite database.
Used by both subclasses, wa-sqlite and sqliteai.

## Implements

- [`KeyringStorageBinding`](../../rxdb-adapter-encrypted/interfaces/KeyringStorageBinding.md)

## Constructors

### Constructor

```ts
new SqliteCoreKeyringStorage(adapter): SqliteCoreKeyringStorage;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/keyring/sqlite-core-keyring-storage.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/keyring/sqlite-core-keyring-storage.ts#L46)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `adapter` | [`RxDBAdapterSqliteBase`](RxDBAdapterSqliteBase.md) |

#### Returns

`SqliteCoreKeyringStorage`

## Methods

### readSingleton() \{#readsingleton\}

```ts
readSingleton(): Promise<
  | KeyringRow
  | null>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/keyring/sqlite-core-keyring-storage.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/keyring/sqlite-core-keyring-storage.ts#L48)

Returns the singleton row; returns `null` when the keyring table is empty.

#### Returns

`Promise`&lt;
  \| [`KeyringRow`](../../rxdb-adapter-encrypted/interfaces/KeyringRow.md)
  \| `null`&gt;

#### Implementation of

[`KeyringStorageBinding`](../../rxdb-adapter-encrypted/interfaces/KeyringStorageBinding.md).[`readSingleton`](../../rxdb-adapter-encrypted/interfaces/KeyringStorageBinding.md#readsingleton)

***

### writeSingleton() \{#writesingleton\}

```ts
writeSingleton(row): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/keyring/sqlite-core-keyring-storage.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/keyring/sqlite-core-keyring-storage.ts#L65)

Inserts the singleton row. If the row already exists, the implementation must throw
`EncryptedConfigurationError(code: 'keyring_singleton_conflict')`
(using `INSERT OR FAIL` / `INSERT … ON CONFLICT DO NOTHING` + validation).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `row` | [`KeyringRow`](../../rxdb-adapter-encrypted/interfaces/KeyringRow.md) |

#### Returns

`Promise`&lt;`void`&gt;

#### Implementation of

[`KeyringStorageBinding`](../../rxdb-adapter-encrypted/interfaces/KeyringStorageBinding.md).[`writeSingleton`](../../rxdb-adapter-encrypted/interfaces/KeyringStorageBinding.md#writesingleton)
