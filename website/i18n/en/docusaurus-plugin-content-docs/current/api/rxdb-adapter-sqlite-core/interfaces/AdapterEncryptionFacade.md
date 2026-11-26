# AdapterEncryptionFacade

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L107)

Developer facade exposed on `adapter.encryption`, internally forwarding to the `Keyring`. If no entity in the database declares encrypted columns, all methods throw `EncryptedConfigurationError(code: 'no_encrypted_columns')`.

## Properties

### isLocked \{#islocked\}

```ts
readonly isLocked: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L111)

---

### lockChange$ \{#lockchange\}

```ts
readonly lockChange$: Observable<boolean>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L112)

## Methods

### isInitialized() \{#isinitialized\}

```ts
isInitialized(): Promise<boolean>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:110](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L110)

#### Returns

`Promise`&lt;`boolean`&gt;

---

### lock() \{#lock\}

```ts
lock(): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L109)

#### Returns

`void`

---

### unlock() \{#unlock\}

```ts
unlock(opts): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L108)

#### Parameters

| Parameter | Type                                                                          |
| --------- | ----------------------------------------------------------------------------- |
| `opts`    | [`UnlockOptions`](../../rxdb-adapter-encrypted/type-aliases/UnlockOptions.md) |

#### Returns

`Promise`&lt;`void`&gt;
