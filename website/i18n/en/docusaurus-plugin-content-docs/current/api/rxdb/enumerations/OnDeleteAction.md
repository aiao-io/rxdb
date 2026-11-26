# OnDeleteAction

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L70)

Foreign key constraint action enumeration
Defines the cascade behavior of SQLite foreign key constraints

SQLite supports specifying ON DELETE and ON UPDATE behavior when defining foreign keys
These constraints are enforced automatically at the database level, without application-layer intervention

## See

https://www.sqlite.org/foreignkeys.html

## Enumeration Members

### CASCADE \{#cascade\}

```ts
CASCADE: 'CASCADE';
```

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L92)

Cascade delete
When a parent table row is deleted, automatically delete all child table rows referencing it

#### Example

```ts
Deleting a user automatically deletes all of their orders
**Warning:** use with caution, may cause large amounts of data to be deleted
```

---

### NO\_ACTION \{#no_action\}

```ts
NO_ACTION: 'NO ACTION';
```

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L77)

Take no action (default)
When a parent table row is deleted, do nothing to child table rows
If references exist, the delete fails (foreign key constraint violation)

#### Default

```ts

```

---

### RESTRICT \{#restrict\}

```ts
RESTRICT: 'RESTRICT';
```

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:84](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L84)

Restrict the delete
If child table references exist, prevent deleting the parent table row
Behavior is similar to NO_ACTION, but the check happens earlier

---

### SET\_DEFAULT \{#set_default\}

```ts
SET_DEFAULT: 'SET DEFAULT';
```

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L108)

Set to default value
When a parent table row is deleted, set the child table's foreign key fields to their default values

#### Example

```ts
When a department is deleted, set employees' department_id to the default department
**Requires:** the foreign key field must have a DEFAULT value defined
```

---

### SET\_NULL \{#set_null\}

```ts
SET_NULL: 'SET NULL';
```

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L100)

Set to NULL
When a parent table row is deleted, set the child table's foreign key fields to NULL

#### Example

```ts
When a category is deleted, set products' category_id to NULL
**Requires:** the foreign key field must allow NULL values
```
