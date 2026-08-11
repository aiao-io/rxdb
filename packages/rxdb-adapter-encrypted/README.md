# @aiao/rxdb-adapter-encrypted

Local field-level **AES-GCM-256** envelope encryption for [`@aiao/rxdb`](../rxdb).
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
import { Entity, Property, PropertyType } from '@aiao/rxdb';
import { WaSqliteAdapter } from '@aiao/rxdb-adapter-wa-sqlite';
import { RxDB } from '@aiao/rxdb';

@Entity({ tableName: 'users' })
class User {
  @Property({ primaryKey: true }) id!: string;
  @Property({ propertyType: PropertyType.STRING }) displayName!: string;

  @Property({ propertyType: PropertyType.STRING, encrypted: true })
  email!: string;
}

const adapter = await WaSqliteAdapter.create({ name: 'app.db' });
const db = await RxDB.create({ adapter, entities: [User] });

await adapter.encryption.unlock({
  passphrase: 'correct horse battery staple'
  // idleTimeoutMs: 10 * 60_000  // override default 5-minute auto-lock
  // idleTimeoutMs: 0            // disable auto-lock
});

await db.repository(User).create({
  id: 'u1',
  displayName: 'Ada',
  email: 'ada@example.com' // encrypted at rest
});
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
- No automatic relock on tab visibility — subscribe to `document.visibilitychange` yourself.

---

## License

MIT
