# KeyringStorageBinding

Defined in: [packages/rxdb-adapter-encrypted/src/keyring-storage.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring-storage.ts#L24)

Implemented by each adapter (sqlite-core, pglite, …) to read and write the keyring singleton row.

## Methods

### readSingleton() \{#readsingleton\}

```ts
readSingleton(): Promise<KeyringRow | null>;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring-storage.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring-storage.ts#L26)

Returns the singleton row; returns `null` when the keyring table is empty.

#### Returns

`Promise`&lt;[`KeyringRow`](KeyringRow.md) \| `null`&gt;

***

### writeSingleton() \{#writesingleton\}

```ts
writeSingleton(row): Promise<void>;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring-storage.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring-storage.ts#L33)

Inserts the singleton row. If the row already exists, the implementation must throw `EncryptedConfigurationError(code: 'keyring_singleton_conflict')` (use `INSERT OR FAIL` / `INSERT … ON CONFLICT DO NOTHING` plus a check).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `row` | [`KeyringRow`](KeyringRow.md) |

#### Returns

`Promise`&lt;`void`&gt;
