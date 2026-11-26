# EntityMetadataOptions

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L113)

Entity definition metadata options interface.
Used to configure the complete options of the `@Entity` decorator, defining the structure and behavior of the entity.

This interface is the core of entity definition and contains all of an entity's configuration:
- Basic information: name, namespace, display name
- Structural information: properties, relations, indexes
- Behavioral information: abstract-class flag, logging configuration, sync strategy

## Example

```typescript
@Entity({
  name: 'User',
  displayName: 'User',
  properties: [
    { name: 'name', type: PropertyType.string, displayName: 'Name' },
    `{ name: 'age', type: PropertyType.number, displayName: 'Age' }`
  ],
  relations: [
    { name: 'profile', kind: RelationKind.ONE_TO_ONE, mappedEntity: 'Profile', mappedProperty: 'user' },
    `{ name: 'posts', kind: RelationKind.ONE_TO_MANY, mappedEntity: 'Post', mappedProperty: 'author' }`
  ]
})
class User extends EntityBase {}
```

## Properties

### abstract? \{#abstract\}

```ts
abstract?: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:188](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L188)

Whether it is an abstract entity.
Abstract classes cannot be instantiated.

***

### checks? \{#checks\}

```ts
checks?: EntityCheckMetadataOptions[];
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:281](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L281)

Entity-level CHECK constraints (single-row invariants, enforced at the storage layer).

A property-level `check` is its syntactic sugar; the two join inheritance merging together by `name` — a
same-name item on a child entity overrides the parent's, and items with different names all take effect. The
constraint name is generated deterministically from the prefix `ck_` + table name + `name` + the 8-character
hash of the normalized expression; changing the expression without renaming is judged as drift (US-030 AC#11).

When an existing table does not match the declaration, `init()` throws `RxDBConstraintDriftError` without
auto-creating it; creation is written by the user into `migrations`, which happen to run right before the
drift check.

#### Example

```typescript
@Entity({
  checks: [
    {
      name: 'qty_xor_formula',
      rule: {
        combinator: 'or',
        rules: [
          { combinator: 'and', rules: [{ field: 'qty', operator: 'notNull' }, { field: 'qtyFormula', operator: 'null' }] },
          `{ combinator: 'and', rules: [{ field: 'qty', operator: 'null' }, { field: 'qtyFormula', operator: 'notNull' }] }`
        ]
      }
    },
    {
      name: 'unit_range',
      rule: `{ combinator: 'and', rules: [{ field: 'unitFrom', operator: '<=', ref: 'unitTo' }] }`
    }
  ]
})
class Item extends EntityBase {}
```

***

### computedProperties? \{#computedproperties\}

```ts
computedProperties?: EntityPropertyMetadataOptions[];
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:219](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L219)

Computed properties.
Dynamically computed read-only properties, not stored in the database.

## Usage conditions
- The corresponding feature must be enabled in `features` (e.g. `tree: { hasChildren: true }`)
- Readable on the entity only, not modifiable

## Computation sources
1. **Database query**: for example the `hasChildren` property of a tree structure
2. **Class method**: computed via a getter method, e.g. `fullName = firstName + lastName`
3. **Complex logic**: dynamically generated from business rules (to be implemented)

#### Example

```typescript
// A computed property in a tree structure
computedProperties: [
  `{ name: 'hasChildren', type: PropertyType.boolean }`
]
```

**Note:** currently used only in tree structures (the `tree` feature).

***

### displayName? \{#displayname\}

```ts
displayName?: string;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:140](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L140)

Display name.

#### Example

```ts
"User", "Order item"
```

***

### exclusions? \{#exclusions\}

```ts
exclusions?: EntityExclusionMetadataOptions[];
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:312](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L312)

Entity-level interval exclusion constraints: two rows are mutually exclusive when all their equal columns are
equal and their intervals intersect in every dimension (US-030 phase C).

On PG this becomes `EXCLUDE USING gist` (`btree_gist` is loaded by the adapter); on SQLite it becomes two
triggers for insert / update; violations are normalized on both backends into `RxDBExclusionViolationError`
carrying both sides' intervals. Inheritance merging is by `name` — a same-name item on a child entity overrides
the parent's, and items with different names all take effect. The constraint name is generated
deterministically from `ex_` + table name + `name` + the hash of the normalized definition; when an existing
table does not match the declaration, `init()` throws `RxDBConstraintDriftError` without auto-creating it.

A NULL endpoint means unbounded on that side; empty intervals and inverted intervals conflict with no row —
to reject inverted intervals, add a separate CHECK. Checks run per row immediately (no deferred checks):
writes where two rows **swap** intervals — a legal final state that nonetheless passes through overlap
regardless of order — are not supported and must be done in two steps through an intermediate value.

#### Example

```typescript
@Entity({
  exclusions: [
    {
      name: 'occurrence_no_overlap',
      equal: ['bomLineId'],
      ranges: [
        { from: 'effectiveFrom', to: 'effectiveTo', bounds: '[)' },
        `{ from: 'unitFrom', to: 'unitTo', bounds: '[]' }`
      ]
    }
  ]
})
class BomLineOccurrence extends EntityBase {}
```

***

### extends? \{#extends\}

```ts
extends?: string[];
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:146](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L146)

The list of inherited entity names.
Indicates which entities the current entity inherits from.

***

### features? \{#features\}

```ts
features?: EntityMetadataFeatures;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:317](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L317)

Feature flags.

***

### foreignKeys? \{#foreignkeys\}

```ts
foreignKeys?: EntityForeignKeyMetadataOptions[];
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:246](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L246)

Entity-level multi-column foreign key constraints.

Single-column relations still use `relations`; use this configuration only when multiple columns must be
validated as one unit.

***

### indexes? \{#indexes\}

```ts
indexes?: EntityIndexMetadataOptions[];
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:239](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L239)

The entity's index configuration.
Indexes defined by this entity itself, not including inherited ones.

***

### log? \{#log\}

```ts
log?: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L177)

Whether to write a change log (`rxdb_change`).

#### Remarks

Once turned off, writes to this table produce no change-log entries, so none of the capabilities built on it
can see this entity:

- History and undo/redo do not record its changes;
- Branch switches do not project its rows; all branches see the same data;
- Sync push does not push its local changes;
- Saving does not dispatch the entity's CREATE / UPDATE events; live queries cannot see inserts and updates and must re-read themselves; removal still dispatches REMOVE as usual (and NEW at construction is dispatched as usual too);
- The draft-cache plugin does not take its drafts; with the working-tree plugin installed it does not enter version control (status / diff / commit / restore all exclude it).

Suitable for data maintained by the library itself that needs no traceability (such as the storage plugin's
file metadata) — not a performance switch for business entities.

#### Default

```ts
true
```

***

### manualOrder? \{#manualorder\}

```ts
manualOrder?: boolean | ManualOrderOptions;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:360](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L360)

Manual ordering: `true` means one sequence for the whole table, `{ groupBy }` means one sequence per group field.

#### Remarks

Explicit opt-in: enabled only when declared; entities that merely happen to have a `sortOrder` field behave
unchanged. Once enabled, the entity must declare its own `sortOrder`: string, writable, non-computed,
unencrypted, non-null (`nullable` is false, i.e. `NOT NULL` at table creation) — violations report
`invalidManualOrder` at registration time. Inherited nearest-first along the prototype chain; a subclass may
write `false` to turn it off, or rewrite the group fields.

Group fields must be scalar columns of the entity itself (including many-to-one foreign key columns),
non-computed, writable, unencrypted — see [ManualOrderOptions](ManualOrderOptions.md). Queries without
`orderBy` default to ordering by `[group fields… asc, sortOrder asc, id asc]`; writes that changed the group
fields without providing a `sortOrder` are appended within the transaction to the end of the new group.

Not called `sortable`: property-level / relation-level `sortable` already means "the column header can be sorted".

#### Default

```ts
false
```

#### Example

```typescript
@Entity({
  name: 'Todo',
  manualOrder: { groupBy: ['completed'] },
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'completed', type: PropertyType.boolean },
    `{ name: 'sortOrder', type: PropertyType.string }`
  ]
})
class Todo extends EntityBase implements ISortableEntity {
  title!: string;
  completed!: boolean;
  sortOrder!: SortOrderKey;
}
```

***

### name \{#name\}

```ts
name: Capitalize<string>;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L127)

Name.

***

### namespace? \{#namespace\}

```ts
namespace?: Lowercase<string>;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L122)

Namespace.
May only contain lowercase English letters.
Becomes a schema in postgres.
Becomes a table prefix in sqlite.

#### Example

```ts
"app", "system"
```

#### Default

```ts
"public"
```

***

### permissions? \{#permissions\}

```ts
permissions?: EntityPermissionOptions;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:324](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L324)

Write-operation permissions, see [EntityPermissionOptions](EntityPermissionOptions.md).

#### Default

All three operations are `'both'`.

***

### properties? \{#properties\}

```ts
properties?: EntityPropertyMetadataOptions[];
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:194](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L194)

The entity's property table.
Properties defined by this entity itself, not including inherited ones.

***

### relations? \{#relations\}

```ts
relations?: EntityRelationMetadataOptions[];
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:233](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L233)

The entity's relation configuration.
Relations defined by this entity itself, not including inherited ones.

Defines the associations between this entity and other entities, supporting four relation types:
- ONE_TO_ONE: a one-to-one relation, such as a user and a user profile
- ONE_TO_MANY: a one-to-many relation, such as a user and the user's many posts
- MANY_TO_ONE: a many-to-one relation, such as many posts and one author
- MANY_TO_MANY: a many-to-many relation, such as students and courses

The system automatically handles foreign keys, queries and association operations according to the relation
configuration.

***

### repository? \{#repository\}

```ts
repository?: RxDBRepositoryName;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:159](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L159)

Custom repository.

#### Remarks

The value comes from the facade-axis registry [RxDBRepositoryName](../type-aliases/RxDBRepositoryName.md): the
core `Repository` and the facades plugins register via `declare module` (such as `TreeRepository` /
`GraphRepository`) are first-class citizens alike in completion. When the name has not been registered via
`RxDB.repository()`, `EntityManager.init()` still throws to block it.

#### Default

```ts
"Repository"
```

***

### sync? \{#sync\}

```ts
sync?: SyncOptions;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:182](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L182)

Entity sync configuration.

***

### tableName? \{#tablename\}

```ts
tableName?: string;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L134)

Table name.
The table name in the database.
When omitted, it is the same as `name`.
