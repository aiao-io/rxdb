# ICascadeOptions

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:163](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L163)

Foreign key cascade options interface.
Defines the foreign key constraint configuration for a relation.

SQLite foreign key constraints are enforced automatically at the database level.
When a parent table record changes, the database automatically handles the child table records according to the configuration.

## Extended by

- [`EntityForeignKeyMetadataOptions`](EntityForeignKeyMetadataOptions.md)

## Properties

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

Cascade behavior on delete.
Defines how the child table's foreign key is handled when the parent table record is deleted.

#### Example

```typescript
// Cascade-delete orders when the user is deleted
onDelete: OnDeleteAction.CASCADE

// Set the product's category ID to NULL when the category is deleted
onDelete: OnDeleteAction.SET_NULL

// Do not allow deleting a user who still has orders
onDelete: OnDeleteAction.RESTRICT
```

#### Default

```ts
Inferred automatically from the relation type
```

***

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

Cascade behavior on update.
Defines how the child table's foreign key is handled when the parent table's primary key is updated.

#### Example

```typescript
// Cascade-update the order's user_id when the user ID is updated
onUpdate: OnUpdateAction.CASCADE

// Do not allow updating the primary key (recommended)
onUpdate: OnUpdateAction.RESTRICT
```

#### Default

```ts
OnUpdateAction.RESTRICT (updating the primary key is not recommended)
```
