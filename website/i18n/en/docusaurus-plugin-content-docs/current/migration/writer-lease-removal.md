# Cross-realm writer lease removal

The set of writer lease / upgrade guard APIs publicly exported by `@aiao/rxdb` 0.0.25 was deleted from core **with no replacement**. **This is a breaking change**: code that references these symbols directly fails at compile time.

Applications that only use `RxDB.connect()` normally and never imported these symbols directly are unaffected and can upgrade as-is — the lease was always started internally by core during connection; applications had no entry point to call.

## Why removed

The lease tried to block, at runtime, an old client that "connected earlier, hung for a long time, and recovers later", but it could only constrain instances that **already loaded the new code**; a genuinely dangerous offline old bundle never reads the lease table at all. That kind of cross-tab / worker / process exclusion must be handled by the release system, see [Schema migrations · Release order](./schema.md#release-order).

## Application developers

### 1. Delete references to the following symbols

| Category  | Removed symbols                                                                                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constants | `RXDB_WRITER_PROTOCOL_VERSION` / `RXDB_WRITER_LEASE_TTL_MS` / `RXDB_WRITER_HEARTBEAT_INTERVAL_MS` / `RXDB_UPGRADE_OWNER_TTL_MS` / `RXDB_WRITER_LEASE_TABLE_NAME` / `RXDB_UPGRADE_GUARD_TABLE_NAME` |
| Functions | `readRxDBUpgradeGuard` / `assertRxDBUpgradeClaimable` / `readRxDBWriterLease` / `resolveRxDBWriterEpoch` / `createRxDBActiveWriterLeaseError`                                                      |
| Types     | `RxDBUpgradeGuardState` / `RxDBUpgradeGuardSnapshot` / `RxDBWriterLeaseSnapshot` / `RxDBWriterLeaseErrorCode`                                                                                      |
| Errors    | `RxDBWriterLeaseError`                                                                                                                                                                             |

```diff
-import { RxDBWriterLeaseError } from '@aiao/rxdb';
-
-try {
-  await rxdb.connect('pglite');
-} catch (error) {
-  if (error instanceof RxDBWriterLeaseError && error.code === 'writer_fenced') {
-    promptReload();
-  }
-  throw error;
-}
+await rxdb.connect('pglite');
```

`connect()` no longer throws `RxDBWriterLeaseError`; delete whole branches that dispatch on `writer_fenced` / `writer_guard_*`, and do not substitute another error type to "catch" it — the new version has no corresponding failure path.

### 2. Two leftover tables in the PGlite database

The 0.0.25 PGlite adapter created two tables under the `rxdb` schema, `rxdb_upgrade_guard` and `rxdb_writer_lease`; the new version neither reads nor writes them. The SQLite-family adapters (wa-sqlite / sqlite-wasm) never created these tables.

- **Leaving them is safe**: the new version does not query, migrate, or depend on them.
- If you want them gone, **wait until every running instance has upgraded** before dropping — a still-online 0.0.25 instance is still writing heartbeats into them:

```sql
DROP TABLE IF EXISTS "rxdb"."rxdb_writer_lease";
DROP TABLE IF EXISTS "rxdb"."rxdb_upgrade_guard";
```

## Adapter authors

`startWriterLease()` on `RxDBAdapterLocalBase` was deleted at the same time, and core no longer calls it from `connect()`. Custom local adapters that `override`d it should delete the method along with its heartbeat / fencing logic; `migrateSystemSchema()` stays unchanged.

The conformance suite `rowsAffectedConformanceSuite` exported by `@aiao/rxdb-adapter-sqlite-core/testing` was also deleted — it asserted exactly the `rowsAffected` behavior the lease heartbeat depended on. Adapter tests that called it just delete that one line; the other shared suites are unchanged.

## See also

- [Schema migrations](./schema.md): the three release gates for system migrations and the old bundle gate
- [Versioning and API stability](../versioning.md): the breaking-change process
