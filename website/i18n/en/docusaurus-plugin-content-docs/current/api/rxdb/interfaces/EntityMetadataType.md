# EntityMetadataType

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L24)

Entity metadata type
Contains all metadata of an entity, such as properties, relations, indexes, etc.

## Extends

- `SetRequired`&lt;[`EntityMetadataOptions`](EntityMetadataOptions.md), `"namespace"` \| `"displayName"` \| `"tableName"` \| `"repository"` \| `"extends"`&gt;

## Properties

### abstract? \{#abstract\}

```ts
abstract?: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:188](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L188)

Whether it is an abstract entity
Abstract classes cannot be instantiated

#### Inherited from

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`abstract`](EntityMetadataOptions.md#abstract)

---

### checkMap \{#checkmap\}

```ts
checkMap: Map<string, EntityCheckMetadataOptions>;
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:107](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L107)

The map of all CHECK constraints of the entity (the full set after inheritance merging, including the items compiled from property-level `check`)
The key is the constraint `name` given by the author, the value is the CHECK metadata

---

### checks \{#checks\}

```ts
checks: EntityCheckMetadataOptions[];
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L33)

Entity-level CHECK constraints (single-row invariants, landing in the storage layer).

Property-level `check` is its syntactic sugar; both enter inheritance merging by `name` — a child entity's same-name item overrides
the parent entity's, and differently-named items all take effect. Constraint names are generated deterministically from prefix `ck_` + table name + `name` + the normalized expression's
8-character hash; changing the expression without renaming is judged as drift (US-030 AC#11).

When an existing table does not match the declaration, `init()` throws `RxDBConstraintDriftError`; no automatic backfill —
backfill is written by users into `migrations`, which runs exactly before the drift check.

#### Example

```typescript
@Entity({
  checks: [
    {
      name: 'qty_xor_formula',
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

#### Overrides

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`checks`](EntityMetadataOptions.md#checks)

---

### columnNameToPropertyName \{#columnnametopropertyname\}

```ts
columnNameToPropertyName: Map<string, string>;
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L95)

Reverse mapping from column names to property names
Used to map database column names back to JS property names

---

### computedProperties \{#computedproperties\}

```ts
computedProperties: EntityPropertyMetadata[];
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L29)

Computed properties
Dynamically computed read-only properties, not stored in the database

## Usage conditions

- The corresponding feature must be enabled in `features` (such as `tree:{ hasChildren: true }`)
- Readable on the entity only, not modifiable

## Computation sources

1. **Database query**: for example the `hasChildren` property of a tree structure
2. **Class method**: computed through a getter, such as `fullName = firstName + lastName`
3. **Complex logic**: generated dynamically from business rules (to be implemented)

#### Example

```typescript
// Computed properties in a tree structure
computedProperties: [`{ name: 'hasChildren', type: PropertyType.boolean }`];
```

**Note:** currently only used in tree structures (the `tree` feature)

#### Overrides

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`computedProperties`](EntityMetadataOptions.md#computedproperties)

---

### computedPropertyMap \{#computedpropertymap\}

```ts
computedPropertyMap: Map<string, EntityPropertyMetadata>;
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L54)

The map of all computed properties of the entity
The key is the property name, the value is the property metadata

---

### defaultValueProperties \{#defaultvalueproperties\}

```ts
defaultValueProperties: EntityPropertyMetadata[];
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L60)

The list of properties with default values
Contains all property metadata with defaults set

---

### displayName \{#displayname\}

```ts
displayName: string;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:140](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L140)

Display name

#### Example

```ts
('User', 'Order item');
```

#### Inherited from

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`displayName`](EntityMetadataOptions.md#displayname)

---

### encryptedPropertyMap \{#encryptedpropertymap\}

```ts
encryptedPropertyMap: Map<string, EntityPropertyMetadata>;
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:120](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L120)

Encrypted property map (added in 004-local-field-encryption)
Contains only properties with `encrypted: true`, keyed by property name.
Size is 0 if the entity has no encrypted properties.

---

### exclusionMap \{#exclusionmap\}

```ts
exclusionMap: Map<string, EntityExclusionMetadataOptions>;
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L113)

The map of all range exclusion constraints of the entity (the full set after inheritance merging)
The key is the constraint `name` given by the author, the value is the range exclusion metadata

---

### exclusions \{#exclusions\}

```ts
exclusions: EntityExclusionMetadataOptions[];
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L34)

Entity-level range exclusion constraints: two rows conflict when all equality columns are equal and every range dimension intersects (US-030 phase C).

PG renders them as `EXCLUDE USING gist` (`btree_gist` is loaded by the adapter), SQLite renders them as insert / update triggers,
and violations are normalized to `RxDBExclusionViolationError` on both backends, carrying both ranges. Inheritance merging goes by `name` —
a child entity's same-name item overrides the parent entity's, and differently-named items all take effect. Constraint names are generated deterministically from `ex_` + table name + `name` + the normalized definition hash;
when an existing table does not match the declaration, `init()` throws `RxDBConstraintDriftError`; no automatic backfill.

A NULL endpoint means that side is unbounded; empty ranges and inverted ranges conflict with no rows — add a CHECK to reject inverted ranges.
Checks run per row immediately (no deferred checking): writes like two rows **swapping** ranges, whose end state is legal but which pass through overlap in either order,
are not supported and must be done in two steps through an intermediate value.

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

#### Overrides

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`exclusions`](EntityMetadataOptions.md#exclusions)

---

### extends \{#extends\}

```ts
extends: string[];
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:146](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L146)

The list of inherited entity names
Indicates which entities the current entity inherits from

#### Inherited from

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`extends`](EntityMetadataOptions.md#extends)

---

### features? \{#features\}

```ts
features?: EntityMetadataFeatures;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:317](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L317)

Features

#### Inherited from

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`features`](EntityMetadataOptions.md#features)

---

### foreignKeyColumnNames \{#foreignkeycolumnnames\}

```ts
foreignKeyColumnNames: string[];
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L89)

The list of the entity's foreign key column names (database column names)
Contains the database column names of all foreign key fields

---

### foreignKeyNames \{#foreignkeynames\}

```ts
foreignKeyNames: string[];
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L83)

The list of the entity's foreign key names (JS property names)
Contains the JS property names of all foreign key fields

---

### foreignKeyRelationMap \{#foreignkeyrelationmap\}

```ts
foreignKeyRelationMap: Map<string, EntityRelationMetadata>;
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L71)

The map of the entity's foreign key relations

---

### foreignKeyRelations \{#foreignkeyrelations\}

```ts
foreignKeyRelations: EntityRelationMetadata[];
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L77)

The list of the entity's foreign key relations
Contains all relation metadata involving foreign keys

---

### foreignKeys \{#foreignkeys\}

```ts
foreignKeys: object[];
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L32)

Entity-level multi-column foreign key constraints.

Single-column relations still use `relations`; use this configuration only when multiple columns must be validated as one unit.

#### mappedEntity

```ts
mappedEntity: Capitalize<string>;
```

The referenced entity.

#### mappedNamespace

```ts
mappedNamespace: Lowercase<string>;
```

The namespace of the referenced entity, defaulting to the current entity's namespace.

#### mappedProperties

```ts
mappedProperties: [string, ...string[]];
```

The properties or relation ID fields of the referenced entity.

#### name

```ts
name: Uncapitalize<string>;
```

Constraint name.

#### onDelete?

```ts
onDelete?:
  | "NO ACTION"
  | "RESTRICT"
  | "CASCADE"
  | "SET NULL"
  | "SET DEFAULT"
  | OnDeleteAction;
```

Cascade behavior on delete
Defines how the foreign keys of child tables are handled when a parent record is deleted

##### Example

```typescript
// Cascade-delete orders when the user is deleted
onDelete: OnDeleteAction.CASCADE;

// Set the category ID of products to NULL when the category is deleted
onDelete: OnDeleteAction.SET_NULL;

// Forbid deleting a user that still has orders
onDelete: OnDeleteAction.RESTRICT;
```

##### Default

```ts
Inferred automatically from the relation type
```

#### onUpdate?

```ts
onUpdate?:
  | "NO ACTION"
  | "RESTRICT"
  | "CASCADE"
  | "SET NULL"
  | "SET DEFAULT"
  | OnUpdateAction;
```

Cascade behavior on update
Defines how the foreign keys of child tables are handled when the parent primary key is updated

##### Example

```typescript
// Cascade-update the user_id of orders when the user ID is updated
onUpdate: OnUpdateAction.CASCADE;

// Forbid updating the primary key (recommended)
onUpdate: OnUpdateAction.RESTRICT;
```

##### Default

```ts
OnUpdateAction.RESTRICT (recommended: do not update primary keys)
```

#### properties

```ts
properties: [string, ...string[]];
```

The properties or relation ID fields of the current entity.

#### Overrides

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`foreignKeys`](EntityMetadataOptions.md#foreignkeys)

---

### indexes \{#indexes\}

```ts
indexes: EntityIndexMetadataOptions[];
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L31)

The index configuration of the entity
Indexes defined by itself, not including inherited ones

#### Overrides

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`indexes`](EntityMetadataOptions.md#indexes)

---

### indexMap \{#indexmap\}

```ts
indexMap: Map<string, EntityIndexMetadataOptions>;
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:101](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L101)

The map of all indexes of the entity
The key is the index name, the value is the index metadata

---

### log? \{#log\}

```ts
log?: boolean;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:177](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L177)

Whether to write change logs (`rxdb_change`)

#### Remarks

Once turned off, writes to this table produce no change log, so none of the capabilities built on it can see this entity:

- History and undo / redo do not record its changes;
- Branch switches do not project its rows; all branches see the same data;
- Sync push does not push its local changes;
- Saves do not dispatch CREATE / UPDATE entity events, so live queries do not see additions and modifications and must re-read on their own; removals still dispatch REMOVE as usual (and the NEW at construction also dispatches as usual);
- The draft cache plugin does not take its drafts; with the working tree plugin installed it is not under version control (status / diff / commit / restore all exclude it).

Suitable for data the database maintains itself and needs no retrospection (such as the storage plugin's file metadata); it is not a performance switch for business entities.

#### Default

```ts
true;
```

#### Inherited from

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`log`](EntityMetadataOptions.md#log)

---

### manualOrder? \{#manualorder\}

```ts
manualOrder?: boolean | ManualOrderOptions;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:360](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L360)

Manual ordering: `true` means one sequence for the whole table, `{ groupBy }` means one sequence per group field

#### Remarks

Explicit opt-in: only enabled when declared; entities that happen to have a `sortOrder` field keep their behavior unchanged.
Once enabled, the entity must declare its own `sortOrder`: string, writable, not computed, not encrypted, non-empty (`nullable` false, `NOT NULL` at table creation),
violations are reported as `invalidManualOrder` at registration. Inherited along the prototype chain with nearest wins; subclasses may write `false` to turn it off, or change the group fields.

Group fields can only be the entity's own scalar columns (including many-to-one foreign key columns), not computed, writable, not encrypted; see [ManualOrderOptions](ManualOrderOptions.md).
Queries without `orderBy` default to `[group fields… asc, sortOrder asc, id asc]`;
writes that changed a group field without providing `sortOrder` append to the end of the new group within the transaction.

It is not called `sortable`: property-level / relation-level `sortable` already means "sortable column header".

#### Default

```ts
false;
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

#### Inherited from

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`manualOrder`](EntityMetadataOptions.md#manualorder)

---

### name \{#name\}

```ts
name: Capitalize<string>;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L127)

Name

#### Inherited from

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`name`](EntityMetadataOptions.md#name)

---

### namespace \{#namespace\}

```ts
namespace: Lowercase<string>;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L122)

Namespace
May only contain lowercase English letters
In postgres it becomes the schema
In sqlite it becomes the table prefix

#### Example

```ts
('app', 'system');
```

#### Default

```ts
'public';
```

#### Inherited from

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`namespace`](EntityMetadataOptions.md#namespace)

---

### permissions? \{#permissions\}

```ts
permissions?: Readonly<Required<EntityPermissionOptions>>;
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L42)

The write operation permissions merged per operation with nearest wins along the prototype chain

#### Remarks

If any layer of the chain has declared, all three keys are filled in; when the whole chain has never declared, this key is not written, and reads always go through `getEntityPermission()`.

#### Overrides

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`permissions`](EntityMetadataOptions.md#permissions)

---

### properties \{#properties\}

```ts
properties: EntityPropertyMetadata[];
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L28)

The property table of the entity
Properties defined by itself, not including inherited ones

#### Overrides

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`properties`](EntityMetadataOptions.md#properties)

---

### propertyMap \{#propertymap\}

```ts
propertyMap: Map<string, EntityPropertyMetadata>;
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L48)

The map of all properties of the entity
The key is the property name, the value is the property metadata

---

### relationMap \{#relationmap\}

```ts
relationMap: Map<string, EntityRelationMetadata>;
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L66)

The map of all relations of the entity
The key is the relation property name, the value is the relation metadata

---

### relations \{#relations\}

```ts
relations: EntityRelationMetadata[];
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L30)

The relation configuration of the entity
Relations defined by itself, not including inherited ones

Defines the associations between this entity and other entities, supporting four relation types:

- ONE_TO_ONE: a one-to-one relation, such as a user and their profile
- ONE_TO_MANY: a one-to-many relation, such as a user and their many posts
- MANY_TO_ONE: a many-to-one relation, such as many posts and one author
- MANY_TO_MANY: a many-to-many relation, such as students and courses

The system handles foreign keys, queries and association operations automatically based on the relation configuration

#### Overrides

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`relations`](EntityMetadataOptions.md#relations)

---

### repository \{#repository\}

```ts
repository: RxDBRepositoryName;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:159](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L159)

Custom repository

#### Remarks

The value comes from the facade-axis registry [RxDBRepositoryName](../type-aliases/RxDBRepositoryName.md): core's `Repository`
and the facades plugins register through `declare module` (such as `TreeRepository` / `GraphRepository`)
are first-class citizens in completion alike.
When the name has never been registered through `RxDB.repository()`, `EntityManager.init()` still throws to stop it.

#### Default

```ts
'Repository';
```

#### Inherited from

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`repository`](EntityMetadataOptions.md#repository)

---

### sync? \{#sync\}

```ts
sync?: SyncOptions;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:182](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L182)

Entity sync configuration

#### Inherited from

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`sync`](EntityMetadataOptions.md#sync)

---

### tableName \{#tablename\}

```ts
tableName: string;
```

Defined in: [packages/rxdb/src/entity/entity-options.interface.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-options.interface.ts#L134)

Table name
The table name in the database
Same as name when not provided

#### Inherited from

[`EntityMetadataOptions`](EntityMetadataOptions.md).[`tableName`](EntityMetadataOptions.md#tablename)

## Methods

### isForeignKey() \{#isforeignkey\}

```ts
isForeignKey(name): boolean;
```

Defined in: [packages/rxdb/src/entity/metadata.interface.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata.interface.ts#L127)

Judges whether a property name is a foreign key

#### Parameters

| Parameter | Type     | Description                |
| --------- | -------- | -------------------------- |
| `name`    | `string` | The property name to check |

#### Returns

`boolean`
