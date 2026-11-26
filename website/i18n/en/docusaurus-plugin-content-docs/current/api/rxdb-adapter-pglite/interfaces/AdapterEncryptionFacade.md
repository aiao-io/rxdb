# AdapterEncryptionFacade

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L156)

Developer facade exposed on `adapter.encryption`, forwarding internally to `Keyring`. If no entity in the database declares encrypted columns, all methods throw `EncryptedConfigurationError(code: 'no_encrypted_columns')`.

## Properties

### isLocked \{#islocked\}

```ts
readonly isLocked: boolean;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:159](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L159)

---

### lockChange$ \{#lockchange\}

```ts
readonly lockChange$: Observable<boolean>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:160](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L160)

## Methods

### lock() \{#lock\}

```ts
lock(): void;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:158](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L158)

#### Returns

`void`

---

### unlock() \{#unlock\}

```ts
unlock(opts): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts:157](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L157)

#### Parameters

| Parameter | Type                                                                          |
| --------- | ----------------------------------------------------------------------------- |
| `opts`    | [`UnlockOptions`](../../rxdb-adapter-encrypted/type-aliases/UnlockOptions.md) |

#### Returns

`Promise`&lt;`void`&gt;
