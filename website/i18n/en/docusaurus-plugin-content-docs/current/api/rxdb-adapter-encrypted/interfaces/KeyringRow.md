# KeyringRow

Defined in: [packages/rxdb-adapter-encrypted/src/keyring-storage.ts:7](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring-storage.ts#L7)

The row persisted in the `rxdb_db_keyring` table.

## Properties

### createdAt \{#createdat\}

```ts
createdAt: number;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring-storage.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring-storage.ts#L10)

Unix timestamp in milliseconds at the time the row was created.

---

### id \{#id\}

```ts
id: 'singleton';
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring-storage.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring-storage.ts#L8)

---

### kdf \{#kdf\}

```ts
kdf: 'pbkdf2-sha256-600000';
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring-storage.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring-storage.ts#L12)

Key derivation function identifier, currently fixed.

---

### kid \{#kid\}

```ts
kid: string;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring-storage.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring-storage.ts#L16)

Base64url-encoded 8-byte random value.

---

### salt \{#salt\}

```ts
salt: string;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring-storage.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring-storage.ts#L14)

Base64url-encoded 16-byte random value.

---

### verifier \{#verifier\}

```ts
verifier: string;
```

Defined in: [packages/rxdb-adapter-encrypted/src/keyring-storage.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/keyring-storage.ts#L18)

Encrypted verifier in envelope form — used to detect a wrong key at unlock time.
