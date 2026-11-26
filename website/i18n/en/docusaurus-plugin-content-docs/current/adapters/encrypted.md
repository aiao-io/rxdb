# Field encryption adapter

`@aiao/rxdb-adapter-encrypted` gives `@aiao/rxdb` **field-level AES-GCM-256 envelope encryption**, keeping designated fields in ciphertext throughout their writes to the database file, change log, query cache, and history snapshots — no plaintext traces left behind.

> Encryption happens transparently at the adapter layer; the Repository API above needs no changes.

## Installation

```bash npm2yarn
npm install @aiao/rxdb-adapter-encrypted
```

The only peer dependencies are `@aiao/rxdb` and `rxjs`. The encryption hooks are wired in by the SQLite-family core (`@aiao/rxdb-adapter-sqlite-core`) and the PGlite adapter internally, and pair with one of the local adapters: `@aiao/rxdb-adapter-wa-sqlite`, `@aiao/rxdb-adapter-sqlite-wasm`, `@aiao/rxdb-adapter-sqliteai`, `@aiao/rxdb-adapter-pglite`. Remote adapters such as Supabase do not need this package.

## Quick start

### 1. Mark encrypted fields

Add `encrypted: true` to fields in `@Entity()`'s `properties`:

```typescript
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'User',
  tableName: 'users',
  properties: [
    { name: 'displayName', type: PropertyType.string },
    { name: 'email', type: PropertyType.string, encrypted: true },
    { name: 'phoneNumber', type: PropertyType.string, encrypted: true }
  ]
})
class User extends EntityBase {
  displayName!: string;
  email!: string;
  phoneNumber!: string;
}
```

> `id` is provided by `EntityBase`; you do not need, and should not, declare the primary key property yourself.

### 2. Initialize the database and unlock the keyring

Create the `RxDB` instance, register the adapter factory, and call `adapter.encryption.unlock()` after connecting — only then can encrypted fields be read and written:

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';

const rxdb = new RxDB({
  dbName: 'app.db',
  context: { userId: 'current-user' },
  entities: [User],
  sync: {
    local: { adapter: 'wa-sqlite' },
    type: SyncType.None
  }
});

rxdb.adapter('wa-sqlite', async db => new RxDBAdapterWaSqlite(db, { vfs: 'OPFSAdaptiveVFS' }));

await rxdb.connect('wa-sqlite');

const adapter = await rxdb.getAdapter('wa-sqlite');

await adapter.encryption.unlock({
  passphrase: 'correct horse battery staple'
});

// encrypted fields can now be read and written normally
await rxdb.entityManager.getRepository(User).create(
  new User({
    displayName: 'Ada',
    email: 'ada@example.com' // encrypted automatically on write
  })
);
```

### 3. Automatic decryption on read

```typescript
import { firstValueFrom } from 'rxjs';

const user = await firstValueFrom(
  User.findOne({
    where: {
      combinator: 'and',
      rules: [{ field: 'displayName', operator: '=', value: 'Ada' }]
    }
  })
);

console.log(user?.email); // 'ada@example.com', decrypted automatically on read
```

## Unlock methods

`unlock()` accepts four mutually exclusive key sources:

```typescript
// 1. passphrase (key derived with PBKDF2)
await adapter.encryption.unlock({ passphrase: 'my-passphrase' });

// 2. raw key bytes (32-byte Uint8Array)
await adapter.encryption.unlock({ keyBytes: new Uint8Array(32) });

// 3. a CryptoKey object
await adapter.encryption.unlock({ key: cryptoKey });

// 4. async key provider (for fetching from Keychain / HSM)
await adapter.encryption.unlock({
  keyProvider: async () => fetchKeyFromSecureStorage()
});
```

### Idle auto-lock

By default the keyring locks itself after 5 minutes without activity; adjust with `idleTimeoutMs`:

```typescript
await adapter.encryption.unlock({
  passphrase: 'my-passphrase',
  idleTimeoutMs: 10 * 60_000 // 10 minutes
  // idleTimeoutMs: 0          // disable auto-lock
});
```

While locked, reading or writing encrypted fields throws `EncryptedLockedError`; call `unlock()` again to re-unlock.

## Encryption spec

| item                  | spec                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------- |
| algorithm             | AES-GCM-256                                                                              |
| IV                    | unique 96-bit IV generated per write                                                     |
| AAD                   | `ns\|table\|column\|pk\|kid` (prevents cross-field / cross-row replay)                   |
| envelope format       | `v\|alg\|kid\|iv\|ct\|tag` (6 base64url text segments)                                   |
| storage type          | all encrypted columns are stored as `TEXT` in the database                               |
| passphrase derivation | PBKDF2, verification probe written to the DB, a wrong passphrase does not retain the key |

## Encrypting bigint / binary fields (US-804)

Beyond existing types such as strings, the encryption adapter also supports encrypting `PropertyType.bigint` and `PropertyType.binary` fields, restoring the **original runtime types** (`bigint` / `Uint8Array`) after decryption:

```typescript
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'Ledger',
  tableName: 'ledgers',
  properties: [
    { name: 'amount', type: PropertyType.bigint, encrypted: true },
    { name: 'receipt', type: PropertyType.binary, encrypted: true }
  ]
})
class Ledger extends EntityBase {
  amount!: bigint;
  receipt!: Uint8Array;
}
```

Encoding and validation (as implemented by `serializeForEnvelope` / `deserializeFromEnvelope`):

| type     | envelope encoding           | validation and copy semantics                                                                                                                             |
| -------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bigint` | signed decimal              | must fit in 64 bits; out-of-range values or passing a `number` throws `TypeError` before encryption                                                       |
| `binary` | raw bytes into the envelope | only the current `Uint8Array` view is encrypted and the plaintext is copied; mutating the original array after save does not affect the encrypted content |

- On read, binary returns an **independent copy** `Uint8Array` that does not share a mutable backing buffer with the caller.
- Tampered ciphertext, tags, or type labels fail authentication and never return partial or degraded values.
- Existing encryption restrictions are **not relaxed**: encrypted bigint / binary still cannot be used for primary keys, foreign keys, indexes, unique constraints, sorting, or queries; violations throw `EncryptedConfigurationError` / `EncryptedQueryError` as before.
- Other encrypted fields on a bigint-primary-key entity use a stable, unambiguous AAD (the identity encoding includes the type and does not rely on bare `String(id)`).
- Decrypted types are consistent across save / read, undo / redo, and branch switching.

## Constraints

The following fields **cannot** be marked `encrypted: true`:

- primary keys (`primaryKey: true`)
- foreign keys / relation fields
- indexed fields (`index: true`)
- unique-constraint fields (`unique: true`)
- sortable fields (`sortable: true`)
- FTS full-text search fields (`searchable: true`)
- computed fields

Violations throw `EncryptedConfigurationError` at RxDB connection time — fail-fast.

Running `where` / `order` / `group` / FTS queries on encrypted fields throws `EncryptedQueryError` (intercepted before SQL generation).

### Plaintext `DEFAULT` in existing databases

CREATE TABLE statements for encrypted columns no longer write a `DEFAULT` (both the SQLite family and PGlite): the adapter fills in the default before encryption (single and bulk INSERT; the QueryCache backfill of new rows in PGlite fills it in the same way) and seals it with the whole row in the envelope. Tables created by 0.0.28 and earlier still keep the old plaintext `DEFAULT` text: SQLite in `sqlite_master` (visible in the database file), PGlite in the column default catalog `pg_attrdef`. The drift checks on both ends do not compare `DEFAULT`, so they do not error over it.

Upgrades **do not auto-migrate** these existing tables. When the default value itself is sensitive, or you do not want plaintext left in the schema: SQLite requires rebuilding the table yourself (export the data, drop the old table, recreate it with the current version, re-import); PGlite clears it with `ALTER TABLE … ALTER COLUMN … DROP DEFAULT` on the corresponding column.

## Error types

| error class                   | triggered by                                                         |
| ----------------------------- | -------------------------------------------------------------------- |
| `EncryptedConfigurationError` | schema violating the constraints (PK/FK/index etc. marked encrypted) |
| `EncryptedLockedError`        | reading or writing encrypted fields while the keyring is locked      |
| `EncryptedDecryptError`       | decryption failure (data corruption or key mismatch)                 |
| `EncryptedUnlockError`        | wrong passphrase or key verification failure                         |
| `EncryptedQueryError`         | filter/sort/FTS queries on encrypted fields                          |

## Outside the MVP scope

The current version does not include:

- whole-database encryption (only declared fields are encrypted)
- native Keychain / WebAuthn / Passkey integration
- searchable encryption (encrypted fields do not support queries)
- key rotation (single `kid`)
- audit logs
- auto re-lock on tab visibility changes

## Reference

- [Model definition](/model-definition/README.md)
- [SQLite adapter](./sqlite.md)
- [SQLite WASM adapter](./sqlite-wasm.md)
