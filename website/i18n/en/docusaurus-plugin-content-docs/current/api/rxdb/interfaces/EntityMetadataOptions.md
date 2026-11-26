# EntityMetadataOptions

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L113)

Entity definition metadata options interface
Configures the full options of the `@Entity` decorator, defining the structure and behavior of an entity

This interface is the core of entity definition and contains all configuration information of an entity:
- Basic information: name, namespace, display name
- Structural information: properties, relations, indexes
- Behavioral information: abstract class marker, log configuration, sync strategy

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

Whether this is an abstract entity
Abstract classes cannot be instantiated

***

### checks? \{#checks\}

```ts
checks?: EntityCheckMetadataOptions[];
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:281](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L281)

Entity-level CHECK constraints (single-row invariants, enforced at the storage layer).

Property-level `check` is its syntactic sugar; the two go into inheritance merging together by `name` — a child entity's same-named item overrides
the parent's, and differently-named items all take effect. Constraint names are deterministically generated from the `ck_` prefix + table name + `name` + an
8-digit hash of the normalized expression; changing the expression without changing the name is judged as drift (US-030 AC#11).

When the existing table disagrees with the declaration, `init()` throws `RxDBConstraintDriftError` and does not auto-create it;
creating it is written into `migrations` by the user, which conveniently runs right before the drift check.

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

Computed properties
Dynamically computed read-only properties, not stored in the database

## Usage conditions
- The corresponding feature must be enabled in `features` (e.g. `tree:{ hasChildren: true }`)
- Readable on the entity only; not modifiable

## Computation sources
1. **Database query**: e.g. the `hasChildren` property of tree structures
2. **Class methods**: computed via getter methods, e.g. `fullName = firstName + lastName`
3. **Complex logic**: generated dynamically from business rules (to be implemented)

#### Example

```typescript
// A computed property in a tree structure
computedProperties: [
  `{ name: 'hasChildren', type: PropertyType.boolean }`
]
```

**Note:** Currently only used in tree structures (the `tree` feature)

***

### displayName? \{#displayname\}

```ts
displayName?: string;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:140](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L140)

Display name

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

Entity-level range exclusion constraints: two rows whose equality columns are all equal and whose ranges intersect in every dimension are mutually exclusive (US-030 phase C).

On PG this becomes `EXCLUDE USING gist` (`btree_gist` is loaded by the adapter); on SQLite it becomes two triggers for insert / update,
and violations are normalized to `RxDBExclusionViolationError` on both backends, carrying both ranges. Merged into inheritance by `name` —
a child entity's same-named item overrides the parent's, and differently-named items all take effect. Constraint names are deterministically generated from `ex_` + table name + `name` + a hash of the normalized definition;
when the existing table disagrees with the declaration, `init()` throws `RxDBConstraintDriftError` and does not auto-create it.

A NULL endpoint means that side is unbounded; empty and inverted ranges conflict with no rows — to reject inverted ranges, add a CHECK.
Checks run immediately per row (no deferred checks): writes where two rows **swap** ranges — legal as a final state but overlapping no matter the order —
are not supported and must be written in two steps through an intermediate value.

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

List of inherited entity names
Indicates which entities the current entity inherits from

***

### features? \{#features\}

```ts
features?: EntityMetadataFeatures;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:317](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L317)

Features

***

### foreignKeys? \{#foreignkeys\}

```ts
foreignKeys?: EntityForeignKeyMetadataOptions[];
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:246](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L246)

Entity-level multi-column foreign key constraints.

Single-column relations still use `relations`; use this configuration only when multiple columns need to be validated as a whole.

***

### indexes? \{#indexes\}

```ts
indexes?: EntityIndexMetadataOptions[];
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:239](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L239)

The entity's index configuration
Self-defined indexes, not including inherited ones

***

### log? \{#log\}

```ts
log?: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L177)

Whether to write a change log (`rxdb_change`)

#### Remarks

With it off, writes to this table produce no change log, so none of the capabilities built on top of it can see this entity:

- History and undo / redo do not record its changes;
- Branch switching does not project its rows; all branches see the same data;
- Sync push does not push its local changes;
- Save does not dispatch the entity's CREATE / UPDATE events, so live queries cannot see inserts and modifications and must re-read themselves; deletes still dispatch REMOVE (and NEW at construction dispatches as usual);
- The draft cache plugin does not collect its drafts; with the working tree plugin installed it is excluded from version control (status / diff / commit / restore all exclude it).

Suitable for data the library maintains itself that needs no lookback (e.g. the storage plugin's file metadata); it is not a performance switch for business entities.

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

Manual ordering: `true` means a single sequence for the whole table, `{ groupBy }` means one sequence per grouping field

#### Remarks

Explicit opt-in: enabled only when declared; entities that happen to have a `sortOrder` field keep their behavior unchanged.
Once enabled, the entity must declare `sortOrder` itself: string, writable, non-computed, unencrypted, and non-null (`nullable` false, i.e. `NOT NULL` at table creation);
violations are reported as `invalidManualOrder` at registration time. Inherited along the prototype chain to the nearest declaration; a subclass may write `false` to turn it off or change the grouping fields.

Grouping fields can only be scalar columns of the entity itself (including many-to-one foreign key columns), non-computed, writable, and unencrypted — see [ManualOrderOptions](ManualOrderOptions.md).
Queries without an `orderBy` default to `[grouping fields… asc, sortOrder asc, id asc]`;
writes that change the grouping fields without providing a `sortOrder` are appended to the end of the new group within the transaction.

Not named `sortable`: property-level / relation-level `sortable` already means "sortable by column header".

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

Name

***

### namespace? \{#namespace\}

```ts
namespace?: Lowercase<string>;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L122)

Namespace
May only contain lowercase English letters
In postgres it becomes a schema
In sqlite it becomes the table prefix

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

Write operation permissions, see [EntityPermissionOptions](EntityPermissionOptions.md)

#### Default

All three operations are `'both'`

***

### properties? \{#properties\}

```ts
properties?: EntityPropertyMetadataOptions[];
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:194](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L194)

The entity's property table
Self-defined properties, not including inherited ones

***

### relations? \{#relations\}

```ts
relations?: EntityRelationMetadataOptions[];
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:233](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L233)

The entity's relation configuration
Self-defined relations, not including inherited ones

Defines the associations between this entity and other entities, supporting four relation types:
- ONE_TO_ONE: one-to-one relation, e.g. a user and a user profile
- ONE_TO_MANY: one-to-many relation, e.g. a user and the user's posts
- MANY_TO_ONE: many-to-one relation, e.g. many posts and one author
- MANY_TO_MANY: many-to-many relation, e.g. students and courses

The system handles foreign keys, queries, and association operations automatically according to the relation configuration

***

### repository? \{#repository\}

```ts
repository?: RxDBRepositoryName;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:159](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L159)

Custom repository

#### Remarks

The value comes from the facade-axis registry [RxDBRepositoryName](../type-aliases/RxDBRepositoryName.md): the core `Repository`
and the facades registered by plugins via `declare module` (such as `TreeRepository` / `GraphRepository`)
are first-class citizens in completion alike.
If the name has not been registered through `RxDB.repository()`, `EntityManager.init()` still throws to block it.

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

Entity sync configuration

***

### tableName? \{#tablename\}

```ts
tableName?: string;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L134)

Table name
The table name in the database
If not provided it is the same as name
