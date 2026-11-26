# RXDB_SYSTEM_SCHEMA_VERSION

```ts
const RXDB_SYSTEM_SCHEMA_VERSION: 9;
```

Defined in: [packages/rxdb/src/system/migration.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/migration.ts#L61)

System table schema version

## Remarks

2: unique index added on `rxdb_migration."name"`.
4: the ten working-tree / commit-graph tables of epic-006 (then living in the core).
5: nullable unique column `rxdb_branch.activeKey` (the "at most one active" half of FR-048).
6: `activeKey` is in place, and the ten tables from v4 are **no longer managed by the core** — they follow
`@aiao/rxdb-plugin-working-tree`, and whether they are claimed is now decided by the capability watermark (see
`system/capability-watermark.ts`).

5 is a **retroactive record** rather than a new capability: the column entered `system/branch.ts` after the v4
watermark, so databases already marked 4 (the batch on dev machines) would never enter the upgrade path again — the
version number is the only trigger of the upgrade path, the column itself is not. Not bumping would leave a hole of
"correct everywhere except that batch of databases".

6 carries **no DDL at all**; it only moves the boundary. Both adapters' `migrateSystemSchema()` is one whole block of
idempotent repair gated solely by `isCurrentRxDBSystemVersion()`, so a database stuck at 4 gets `activeKey` backfilled
and one stuck at 5 runs through empty, both re-marked 6, without changing a single adapter line. **Do not reuse 4 or 5
with changed semantics**: the watermark number is the only trigger of the upgrade path, and redefining 4 would cause
the batch of databases already marked 4 to be silently misread — and a misread produces no compile error.

7: `RxDBChange` gains nullable columns `rejectedAt`, `rejection` (US-218 phase B, push receipts persisted). Both
adapters' `migrateSystemSchema()` probe for the column first, then `ADD COLUMN`, skipping when it is already present,
so a database with "column present but watermark still 6" re-runs without error; old rows have `null` in both columns
and are not backfilled — they are either already pushed successfully or still pending, never rejected.

8: the physical table-set source of `RxDBChange.tableSetSuffix` when written in a fixed way; the main table set and
old logs are `null`. Both adapters add the column first and then rebuild the main-table and shadow-table triggers;
events no longer depend on the branch's current holding relationship.

9: `RxDBSync` gains nullable column `remoteBackendId`, recording the remote identity the downstream cursor belongs to.
8 was bumped even though unpublished: databases already marked 8 on dev machines will never re-enter the upgrade
path, and reusing 8 would leave them missing this column. Legacy rows are `null` and get bound on first sync.

There is one kind of database it **cannot catch**, which must go into the release notes: databases that enabled the
commit capability **before** the package extraction sit at 4/5, with the ten tables still physically present and
carrying real data, but without capability-watermark rows (that shape only exists after the extraction). So a new
client opens them normally even without the plugin installed, and writes no longer pass through capture — the guard in
`capability-watermark.ts` only recognizes watermark rows and cannot reach this case. No dedicated migration is written
for it because this batch only exists on dev machines: epic-006 was never published.

**Changing this constant is a one-way operation**: after a bump, older clients opening the database refuse it with
[UnsupportedRxDBSystemVersionError](../classes/UnsupportedRxDBSystemVersionError.md). This is not a new hazard surface (2→3 was the
same), but every bump must go into the release notes.

Leaving the constant at an old value fails to compile nothing — the watermark is built from a template string and
would quietly stay put, so existing databases never enter the upgrade path. The "system schema version constant and
watermark row stay at the current value" case in `__tests__/system/migration.spec.ts` pins it down precisely for this
reason — it is the only case in that section that hardcodes the version number; do not casually change it to read the
constant.
