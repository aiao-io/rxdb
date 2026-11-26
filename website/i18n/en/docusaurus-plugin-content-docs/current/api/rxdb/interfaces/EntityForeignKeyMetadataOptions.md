# EntityForeignKeyMetadataOptions

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:576](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L576)

Entity-level foreign key constraint.

## Remarks

Relation metadata handles single-column foreign keys; use this configuration to declare cross-column business invariants. `properties` and
`mappedProperties` correspond one-to-one by position, and the referenced side must have a matching unique index.

## Extends

- [`ICascadeOptions`](ICascadeOptions.md)

## Properties

### mappedEntity \{#mappedentity\}

```ts
mappedEntity: Capitalize<string>;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:582](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L582)

The referenced entity.

---

### mappedNamespace? \{#mappednamespace\}

```ts
mappedNamespace?: Lowercase<string>;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:584](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L584)

The referenced entity's namespace; defaults to inheriting the current entity's namespace.

---

### mappedProperties \{#mappedproperties\}

```ts
mappedProperties: [string, ...string[]];
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:586](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L586)

The referenced entity's properties or relation ID fields.

---

### name \{#name\}

```ts
name: Uncapitalize<string>;
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:578](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L578)

Constraint name.

---

### onDelete? \{#ondelete\}

```ts
onDelete?:
  | "NO ACTION"
  | "RESTRICT"
  | "CASCADE"
  | "SET NULL"
  | "SET DEFAULT"
  | OnDeleteAction;
```

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:182](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L182)

Cascade behavior on delete
Defines how the foreign keys in child tables are handled when a parent-table record is deleted

#### Example

```typescript
// Cascades deletes to orders when a user is deleted
onDelete: OnDeleteAction.CASCADE;

// Sets the category ID of products to NULL when a category is deleted
onDelete: OnDeleteAction.SET_NULL;

// Prevents deleting a user that still has orders
onDelete: OnDeleteAction.RESTRICT;
```

#### Default

```ts
Inferred automatically from the relation type
```

#### Inherited from

[`ICascadeOptions`](ICascadeOptions.md).[`onDelete`](ICascadeOptions.md#ondelete)

---

### onUpdate? \{#onupdate\}

```ts
onUpdate?:
  | "NO ACTION"
  | "RESTRICT"
  | "CASCADE"
  | "SET NULL"
  | "SET DEFAULT"
  | OnUpdateAction;
```

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:205](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L205)

Cascade behavior on update
Defines how the foreign keys in child tables are handled when the parent table's primary key is updated

#### Example

```typescript
// Cascades the user_id in orders when the user ID is updated
onUpdate: OnUpdateAction.CASCADE;

// Disallows primary key updates (recommended)
onUpdate: OnUpdateAction.RESTRICT;
```

#### Default

```ts
OnUpdateAction.RESTRICT (primary key updates not recommended)
```

#### Inherited from

[`ICascadeOptions`](ICascadeOptions.md).[`onUpdate`](ICascadeOptions.md#onupdate)

---

### properties \{#properties\}

```ts
properties: [string, ...string[]];
```

Defined in: [packages/rxdb/src/entity/property-types.interface.ts:580](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/property-types.interface.ts#L580)

The current entity's properties or relation ID fields.
