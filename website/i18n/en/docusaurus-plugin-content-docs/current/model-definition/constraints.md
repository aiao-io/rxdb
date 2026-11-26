# Storage constraints

Entity metadata can declare three kinds of storage constraints. They are written into the table DDL and checked by the database on every write, whether the write comes from a repository, a batch of `mutations`, undo / redo, or a sync pull:

- **CHECK**: `checks`, or `check` on a property
- **Partial uniqueness**: `where` on an index
- **Range exclusion**: `exclusions`

The SQLite family and PGlite behave identically and throw the same error class on violation. Remote adapters (supabase / http) do not control the DDL: an entity whose primary storage is remote makes `connect()` fail immediately when it declares a constraint, while for a "local + remote sync" entity the local adapter enforces the constraint.

## CHECK

The rule syntax reuses `RuleGroup` from queries (`combinator` + `rules`), narrowed to the subset that looks at a single row, plus `ref` for field-to-field comparison:

```ts
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'BomLine',
  properties: [
    // Property-level syntactic sugar: compiles to an entity-level CHECK named qty
    { name: 'qty', type: PropertyType.integer, nullable: true, check: { operator: '>', value: 0 } },
    { name: 'qtyFormula', type: PropertyType.string, nullable: true },
    { name: 'unitFrom', type: PropertyType.integer, nullable: true },
    { name: 'unitTo', type: PropertyType.integer, nullable: true }
  ],
  checks: [
    {
      name: 'qty_xor_formula', // exactly one of qty and qtyFormula has a value
      rule: {
        combinator: 'or',
        rules: [
          {
            combinator: 'and',
            rules: [
              { field: 'qty', operator: 'notNull' },
              { field: 'qtyFormula', operator: 'null' }
            ]
          },
          {
            combinator: 'and',
            rules: [
              { field: 'qty', operator: 'null' },
              { field: 'qtyFormula', operator: 'notNull' }
            ]
          }
        ]
      }
    },
    {
      name: 'unit_range', // field-to-field: lower bound <= upper bound
      rule: { combinator: 'and', rules: [{ field: 'unitFrom', operator: '<=', ref: 'unitTo' }] }
    }
  ]
})
export class BomLine extends EntityBase {}
```

- The only operators are `=` `!=` `<` `>` `<=` `>=` `in` `notIn` `between` `notBetween` `null` `notNull`. `contains` / `startsWith` / `exists`, relation paths, and JSON / key-value / binary / encrypted columns fail at declaration time.
- **NULL passes under SQL three-valued logic**: `unitFrom <= unitTo` with a NULL is unknown, so the CHECK passes. Add `notNull` explicitly to reject NULL.
- Literals on an `integer` column must stay within the 32-bit integer range (PG creates it as `integer`). Declare the column as `bigint` if you need a larger range.
- Literals on a `uuid` column must use the canonical lowercase, hyphenated form (for example `'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'`). PG parses the literal as a uuid when creating the table, while SQLite only compares text, so uppercase or unhyphenated forms are inconsistent across the two and fail at declaration time.
- A violation throws `RxDBCheckViolationError` with the entity name, the constraint name, and the conflicting column values of the write.

## Partial uniqueness

Add `where` to a unique index so it applies only to the rows that satisfy the condition:

```ts
@Entity({
  name: 'ItemRevision',
  properties: [
    { name: 'itemId', type: PropertyType.uuid },
    { name: 'state', type: PropertyType.string }
  ],
  indexes: [
    {
      name: 'released_item', // at most one released revision per item; drafts are unrestricted
      properties: ['itemId'],
      unique: true,
      where: { combinator: 'and', rules: [{ field: 'state', operator: '=', value: 'released' }] }
    }
  ]
})
export class ItemRevision extends EntityBase {}
```

- `where` uses the same rule syntax and the same operator set as CHECK. It can only be paired with `unique: true`; a plain index with `where` fails at declaration time.
- A violation is the same error as an ordinary unique conflict (PG `23505` / SQLite `UNIQUE constraint failed`); there is no separate error class.

## Range exclusion

"Equality columns + range dimensions": two rows exclude each other when all equality columns are equal and the ranges intersect in **every dimension**. This fits invariants such as "the effective periods of occurrences on the same line must not overlap":

```ts
@Entity({
  name: 'BomOccurrence',
  properties: [
    { name: 'bomLineId', type: PropertyType.uuid },
    { name: 'effectiveFrom', type: PropertyType.date, nullable: true },
    { name: 'effectiveTo', type: PropertyType.date, nullable: true },
    { name: 'unitFrom', type: PropertyType.integer, nullable: true },
    { name: 'unitTo', type: PropertyType.integer, nullable: true }
  ],
  exclusions: [
    {
      name: 'occurrence_no_overlap',
      equal: ['bomLineId'],
      ranges: [
        { from: 'effectiveFrom', to: 'effectiveTo', bounds: '[)' }, // left-closed, right-open: an end touching the next start does not overlap
        { from: 'unitFrom', to: 'unitTo', bounds: '[]' } // both closed: adjacent 136 and 137 do not overlap
      ]
    }
  ]
})
export class BomOccurrence extends EntityBase {}
```

- Range dimensions only accept `date` / `integer` / `bigint` columns, and `bounds` can only be `'[)'` or `'[]'`. A NULL endpoint means that side is unbounded.
- On a `bigint` `'[]'` dimension, the upper endpoint can take the maximum value `9223372036854775807n`. On PGlite this is the same as being unbounded above, so on violation `ranges` reports `null` for that end, while the SQLite family reports the original value.
- An inverted range whose start is after its end counts as an empty range and never conflicts with any row. To reject inverted ranges, add a CHECK `from <= to`.
- Equality columns can be the entity's own properties or relation foreign keys (for example `parentId`). Rows with any equality column NULL do not participate in conflicts.
- A violation throws `RxDBExclusionViolationError`. `ranges` gives, per dimension, the ranges of the row being written (`incoming`) and of the existing conflicting row (`existing`).
- Checks run per row, immediately. Within a single `saveMany` / `mutations`, an undo / redo, or a branch switch, entities with range exclusions execute in "delete → update → insert" order, so "closing the old row + opening a new row" can be saved and replayed together. Two rows that **swap** ranges must pass through an overlap in any order and are still rejected; write through an intermediate value in two steps.
- On PGlite this becomes `EXCLUDE USING gist`, and the adapter loads the `btree_gist` extension automatically. The Electron PGlite is created by the main process, so load `@electric-sql/pglite/contrib/btree_gist` in `createRuntime`; use `pgliteServerExtensionRequirementsOf(entities)` to decide whether it is needed.
- On SQLite this becomes two triggers, one for insert and one for update, that look up the rows of the same group by the equality columns. When the data is large, declare a plain index on the equality columns as well.

## Existing tables and constraint drift

Constraint names are generated deterministically from the metadata: a prefix (`ck_` / `uq_` / `ex_`) + the table name + your `name` + an 8-character hash of the definition. `name` must start with a lowercase letter and contain only lowercase letters, digits, and underscores, and the whole constraint name must not exceed 63 bytes. For an entity that declares constraints, the table name may also contain only letters, digits, and underscores: the constraint name must appear verbatim in violation messages, and spaces, colons, or quotes would truncate it.

`connect()` compares the constraints actually present in the database against the declarations. **On an existing table, a missing declared constraint or an extra undeclared constraint both throw `RxDBConstraintDriftError`**, listing the missing and extra constraint names. The framework does not add them for you, because old data might already violate the new constraint. Add them in `migrations` (migrations run before the comparison), then call `connect()` again. Changing only the rule while keeping `name` also changes the name and is treated as drift in the same way.

The SQLite host version must be 3.47.0 or later (the trigger messages for range exclusions must carry the conflicting range). When any storage constraint is declared and the host version is lower, `connect()` fails and names the actual version. Applications that declare none are unaffected.

### Upgrade: renamed exclusions with a `bigint` `'[]'` range dimension

For an exclusion with a `bigint` range dimension and `bounds: '[]'`, the PG expression now treats an upper endpoint equal to `9223372036854775807n` as unbounded above. Previously such a valid row could not be written on PGlite even with no competing rows, because range normalization added one to the upper bound and threw `22003 bigint out of range`. The expression takes part in the constraint name hash, so **exclusions containing such a range dimension are renamed**; exclusions over `date`, `integer`, and `bigint` `'[)'` dimensions keep their names.

After the upgrade, existing databases (including ones restored from old archives) throw `RxDBConstraintDriftError` on `connect()`: `extra` holds the old name and `missing` the new one. In `migrations`, drop the old constraint and rebuild it under the new name (migrations run before the drift comparison). Replace `LEGACY` in the examples with the old constraint name from the drift error's `extra`; on the SQLite family, `extra` holds trigger names, so strip the `_i` / `_u` suffix to get the constraint name.

PGlite:

```typescript
import {
  compileExclusionConstraint,
  exclusionRangeExpressionPG,
  getEntityMetadata,
  type MigrationType
} from '@aiao/rxdb';

const LEGACY = 'ex_SerialLedger_serial_no_overlap_<old hash>'; // from the drift error's extra

export const rebuildSerialExclusion: MigrationType = {
  name: '20261110-rebuild-serial-exclusion',
  async up(executor) {
    const metadata = getEntityMetadata(SerialLedger);
    const { name, equal, ranges } = compileExclusionConstraint(
      metadata,
      metadata.exclusionMap.get('serial_no_overlap')!
    );
    const elements = [
      ...equal.map(({ column }) => `"${column}" WITH =`),
      ...ranges.map(range => `${exclusionRangeExpressionPG(range)} WITH &&`)
    ].join(', ');
    const table = executor.tableRef(SerialLedger);
    await executor.query(`ALTER TABLE ${table} DROP CONSTRAINT "${LEGACY}"`);
    await executor.query(`ALTER TABLE ${table} ADD CONSTRAINT "${name}" EXCLUDE USING gist (${elements})`);
  },
  async down() {}
};
```

Do not use `RENAME CONSTRAINT` instead: the name matches and the drift check passes, but the old expression that overflows stays. Rows with `to = maximum value` could never be written under the old constraint anyway, so validating the existing data during the rebuild does not fail.

SQLite family (SQLite has no dynamic SQL, so the `_i` and `_u` triggers each fetch their original text, replace the constraint name, and rebuild):

```typescript
import { compileExclusionConstraint, exclusionTriggerNames, getEntityMetadata, type MigrationType } from '@aiao/rxdb';

const LEGACY = 'ex_SerialLedger_serial_no_overlap_<old hash>'; // from the drift error's extra, with the _i / _u suffix stripped

export const renameSerialExclusionTriggers: MigrationType = {
  name: '20261110-rename-serial-exclusion-triggers',
  async up(executor) {
    const metadata = getEntityMetadata(SerialLedger);
    const { name } = compileExclusionConstraint(metadata, metadata.exclusionMap.get('serial_no_overlap')!);
    for (const trigger of exclusionTriggerNames(LEGACY)) {
      const { rows } = await executor.query(`SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?`, [
        trigger
      ]);
      await executor.query(`DROP TRIGGER "${trigger}"`);
      await executor.query(String(rows[0][0]).replaceAll(LEGACY, name));
    }
  },
  async down() {}
};
```

Do this once for each exclusion that contains a `bigint` `'[]'` range dimension. After the rebuild, call `connect()` again; the same migration does not run twice.
