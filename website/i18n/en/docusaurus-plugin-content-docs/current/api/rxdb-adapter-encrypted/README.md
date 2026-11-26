# rxdb-adapter-encrypted

Local field-level **AES-GCM-256** envelope encryption for [`@aiao/rxdb`](../rxdb/README.md).
Plugs into the SQLite-core / PGlite / wa-sqlite / sqliteai adapters with
zero-plaintext-at-rest guarantees on the structural database files,
change log, query cache and history snapshots.

---

## Install

```bash
pnpm add @aiao/rxdb-adapter-encrypted
```

Peer of any local SQLite-family adapter
(`@aiao/rxdb-adapter-wa-sqlite`, `@aiao/rxdb-adapter-pglite`,
`@aiao/rxdb-adapter-sqlite-wasm`, `@aiao/rxdb-adapter-sqliteai`).
Not needed for Supabase or remote-only adapters.

---

## Quickstart

```ts
import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';

@Entity({
  name: 'User',
  tableName: 'users',
  properties: [
    { name: 'displayName', type: PropertyType.string },
    `{ name: 'email', type: PropertyType.string, encrypted: true }`
  ]
})
class User extends EntityBase {
  displayName!: string;
  email!: string;
}

const rxdb = new RxDB({
  dbName: 'app.db',
  context: { userId: 'current-user' },
  entities: [User],
  sync: `{ local: { adapter: 'wa-sqlite' }, type: SyncType.None }`
});

rxdb.adapter('wa-sqlite', async db => new RxDBAdapterWaSqlite(db, { vfs: 'OPFSAdaptiveVFS' }));
await rxdb.connect('wa-sqlite');

const adapter = await rxdb.getAdapter('wa-sqlite');

await adapter.encryption.unlock({
  passphrase: 'correct horse battery staple'
  // idleTimeoutMs: 10 * 60_000  // override default 5-minute auto-lock
  // idleTimeoutMs: 0            // disable auto-lock
});

await rxdb.entityManager.getRepository(User).create(
  new User({
    displayName: 'Ada',
    email: 'ada@example.com' // encrypted at rest
  })
);
```

---

## Public API

```ts
import {
  // Keyring lifecycle
  Keyring,
  createKeyring,
  type UnlockOptions,
  type PassphraseUnlockOptions,
  type KeyBytesUnlockOptions,
  type CryptoKeyUnlockOptions,
  type KeyProviderUnlockOptions,
  type LegacyEnvelopePolicy,

  // Envelope codec
  encodeEnvelope,
  decodeEnvelope,
  isEnvelope,
  buildAAD,
  ENVELOPE_VERSION,
  ENVELOPE_ALG,
  type CryptoEnvelope,
  type EnvelopeVersion,

  // Schema + query validators
  validateEncryptedPropertyMetadata,
  validateFTSRegistrationAgainstEncryptedColumns,
  validateQueryAgainstEncryptedColumns,
  type EncryptedAwareEntity,

  // Typed errors
  EncryptedError,
  EncryptedConfigurationError,
  EncryptedDecryptError,
  EncryptedLockedError,
  EncryptedQueryError,
  EncryptedUnlockError,
  type EncryptedErrorCode,
  type EncryptedErrorInit,

  // Keyring persistence binding
  type KeyringRow,
  type KeyringStorageBinding,

  // Verifier sentinel constant
  VERIFIER_SENTINEL
} from '@aiao/rxdb-adapter-encrypted';

import { scanForPlaintext, type ScanHit } from '@aiao/rxdb-adapter-encrypted/testing';
```

Refer to the TSDoc on each export for its security and lifecycle contract.

---

## Guarantees

| Spec   | Guarantee                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | Schema validation rejects encrypted PK / FK / index / unique / sortable / FTS / computed columns                                                                          |
| FR-002 | Envelope text form `v\|alg\|kid\|iv\|ct\|tag`; new writes use v2                                                                                                          |
| FR-003 | AES-GCM-256 with a unique 96-bit IV; length-prefixed AAD binds the database, entity namespace, table, column, typed ID and `kid`                                          |
| FR-004 | `unlock()` accepts exactly one of `passphrase` / `keyBytes` / `key` / `keyProvider`                                                                                       |
| FR-005 | All encrypted columns are emitted as `TEXT` regardless of logical type                                                                                                    |
| FR-006 | Zero plaintext in DB files, `rxdb_change` patches, query cache, history snapshots                                                                                         |
| US-804 | Encrypted bigint is signed 64-bit decimal; binary copies the current Uint8Array view and restores an independent Uint8Array                                               |
| FR-007 | Filter / order / group / projection over encrypted columns throws `EncryptedQueryError`; FTS registration throws `EncryptedConfigurationError('encrypted_fts_forbidden')` |
| FR-008 | Locked-state reads throw `EncryptedLockedError`; idle auto-lock after `5 min` (configurable, `0` disables)                                                                |
| FR-009 | `unlock()` verifies passphrase against persisted `verifier` probe; wrong passphrase never retains key                                                                     |

---

## Migrating v1 Envelopes

v1 entity envelopes are rejected by default because their AAD does not bind the
entity namespace and uses ambiguous delimiter boundaries. Enable legacy reads
only for a bounded migration:

```ts
await adapter.encryption.unlock({
  passphrase: 'correct horse battery staple',
  legacyEnvelopePolicy: 'migration'
});
```

Read and rewrite every encrypted entity while this policy is active. Every
write produces v2. After the rewrite, lock and unlock without
`legacyEnvelopePolicy`; any remaining v1 entity envelope then fails with
`EncryptedDecryptError.code === 'legacy_envelope_forbidden'`. Existing v1
keyring verifiers remain readable during unlock so a legacy database can enter
the migration flow. A failed v2 authentication is never retried with v1 AAD.

---

## What this package does NOT do (MVP)

- No full-database encryption — only declared columns are sealed.
- No native keychain / passkey / WebAuthn — bring your own passphrase or key bytes.
- No searchable encryption — `where` / `order` / `group` / FTS on encrypted columns is rejected.
- No key rotation — single `kid` per database for the MVP.
- No audit log — decrypt failures throw, not persisted.
- No automatic migration of existing tables — tables created by releases up to 0.0.28 keep the old plaintext column `DEFAULT` text (in `sqlite_master` on SQLite, in the column-default catalog `pg_attrdef` on PGlite); the current version no longer writes it on either backend. On SQLite, rebuild the table (export, drop, recreate, import) to remove it; on PGlite, `ALTER TABLE … ALTER COLUMN … DROP DEFAULT` removes it.
- No automatic relock on tab visibility — subscribe to `document.visibilitychange` yourself.

---

## License

MIT

## Classes

| Class                                                                 | Description                                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [EncryptedConfigurationError](classes/EncryptedConfigurationError.md) | Configuration errors in the schema / initialization / lifecycle phases.                    |
| [EncryptedDecryptError](classes/EncryptedDecryptError.md)             | Envelope-layer failure on read.                                                            |
| [EncryptedError](classes/EncryptedError.md)                           | Abstract base class of all errors thrown by `@aiao/rxdb-adapter-encrypted`.                |
| [EncryptedLockedError](classes/EncryptedLockedError.md)               | Triggered when the encrypt / decrypt path is entered while `Keyring.isLocked`.             |
| [EncryptedQueryError](classes/EncryptedQueryError.md)                 | A query references encrypted columns.                                                      |
| [EncryptedUnlockError](classes/EncryptedUnlockError.md)               | `unlock()` key verification or provider distribution failed, or was cancelled by `lock()`. |
| [Keyring](classes/Keyring.md)                                         | Database-level AES-GCM-256 key lifecycle and cell envelope encrypter / decrypter.          |

## Interfaces

| Interface                                                          | Description                                                                                                                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [CryptoEnvelope](interfaces/CryptoEnvelope.md)                     | Fields of a decoded AES-GCM envelope. Binary fields are all independent `Uint8Array`s.                                                                     |
| [CryptoKeyUnlockOptions](interfaces/CryptoKeyUnlockOptions.md)     | Unlock via an AES-GCM-256 `CryptoKey` with encrypt/decrypt usage.                                                                                          |
| [DecryptArgs](interfaces/DecryptArgs.md)                           | Cell decryption parameters. The entity namespace, table, column and typed primary key must match the AAD identity used at encryption time.                 |
| [EncryptArgs](interfaces/EncryptArgs.md)                           | Cell encryption parameters. Besides the plaintext bytes, the remaining fields together form the v2 AAD identity and must match exactly at decryption time. |
| [EncryptedAwareEntity](interfaces/EncryptedAwareEntity.md)         | Minimal entity metadata shape required for schema and query safety validation.                                                                             |
| [EncryptedErrorInit](interfaces/EncryptedErrorInit.md)             | Structured context shared by all encryption errors. All fields are safe for error triage.                                                                  |
| [KeyBytesUnlockOptions](interfaces/KeyBytesUnlockOptions.md)       | Unlock via exactly 32 bytes of raw AES-GCM-256 key.                                                                                                        |
| [KeyProviderUnlockOptions](interfaces/KeyProviderUnlockOptions.md) | Obtain a `CryptoKey` or 32-byte raw key through an async provider. Provider failures are wrapped structurally.                                             |
| [KeyringRow](interfaces/KeyringRow.md)                             | The row persisted in the `rxdb_db_keyring` table.                                                                                                          |
| [KeyringStorageBinding](interfaces/KeyringStorageBinding.md)       | Implemented by each adapter (sqlite-core, pglite …) to read and write the keyring singleton row.                                                           |
| [PassphraseUnlockOptions](interfaces/PassphraseUnlockOptions.md)   | Unlock parameters that derive a PBKDF2 passphrase and verify the persisted keyring.                                                                        |
| [PatchWalkArgs](interfaces/PatchWalkArgs.md)                       | Entity identity, primary key and keyring needed to encrypt/decrypt undo/redo change patches.                                                               |

## Type Aliases

| Type Alias                                                         | Description                                                                                                                            |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| [EncryptedEntityResolver](type-aliases/EncryptedEntityResolver.md) | Resolves relation target metadata by entity name and optional namespace. Returning `undefined` makes cross-entity queries fail-closed. |
| [EncryptedErrorCode](type-aliases/EncryptedErrorCode.md)           | Union of all concrete subclasses' `code` literals.                                                                                     |
| [EnvelopeVersion](type-aliases/EnvelopeVersion.md)                 | Envelope versions that can be parsed; new writes always use v2, v1 is read only for explicit migration.                                |
| [LegacyEnvelopePolicy](type-aliases/LegacyEnvelopePolicy.md)       | Read policy for v1 entity envelopes; all new writes always produce v2.                                                                 |
| [UnlockOptions](type-aliases/UnlockOptions.md)                     | One of four mutually exclusive key sources, optionally with idle-lock and legacy-envelope migration policies.                          |

## Variables

| Variable                                             | Description                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------- |
| [ENVELOPE\_ALG](variables/ENVELOPE_ALG.md)           | The frozen current algorithm label.                             |
| [ENVELOPE\_VERSION](variables/ENVELOPE_VERSION.md)   | The frozen current envelope version.                            |
| [VERIFIER\_SENTINEL](variables/VERIFIER_SENTINEL.md) | Fixed plaintext used for the keyring verifier probe encryption. |

## Functions

| Function                                                                                                      | Description                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [buildAAD](functions/buildAAD.md)                                                                             | -                                                                                                                                                                                                                  |
| [createKeyring](functions/createKeyring.md)                                                                   | Creates an initially locked [Keyring](classes/Keyring.md) bound to the given database authentication domain and persistent storage.                                                                                |
| [decodeEnvelope](functions/decodeEnvelope.md)                                                                 | -                                                                                                                                                                                                                  |
| [deserializeFromEnvelope](functions/deserializeFromEnvelope.md)                                               | Restores authenticated plaintext bytes back to business values by the property type at persistence time.                                                                                                           |
| [encodeEnvelope](functions/encodeEnvelope.md)                                                                 | -                                                                                                                                                                                                                  |
| [envelopePlaintextPatches](functions/envelopePlaintextPatches.md)                                             | Walks the top-level keys of a plaintext patch; for keys present in `entity.encryptedPropertyMap`, replaces the value with the envelope string produced by `keyring.encrypt`. Unencrypted keys are copied directly. |
| [isEnvelope](functions/isEnvelope.md)                                                                         | -                                                                                                                                                                                                                  |
| [serializeForEnvelope](functions/serializeForEnvelope.md)                                                     | Encodes a single non-null business value into envelope plaintext bytes by property type.                                                                                                                           |
| [unenvelopePlaintextPatches](functions/unenvelopePlaintextPatches.md)                                         | Inverse of `envelopePlaintextPatches`: decrypts top-level envelope strings back to plaintext. Used when applying undo/redo `inversePatch`.                                                                         |
| [validateEncryptedPropertyMetadata](functions/validateEncryptedPropertyMetadata.md)                           | Validates that encrypted properties cannot participate in primary key, foreign key, index, unique, sortable, computed columns or FTS.                                                                              |
| [validateEncryptedQuery](functions/validateEncryptedQuery.md)                                                 | Maps RxDB query parameters to the generic encrypted-query validator.                                                                                                                                               |
| [validateFTSRegistrationAgainstEncryptedColumns](functions/validateFTSRegistrationAgainstEncryptedColumns.md) | Rejects registering encrypted columns into an FTS index.                                                                                                                                                           |
| [validateQueryAgainstEncryptedColumns](functions/validateQueryAgainstEncryptedColumns.md)                     | Rejects filtering, ordering, grouping or explicit projection over encrypted columns.                                                                                                                               |
