# OnUpdateAction

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:118](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L118)

Foreign key update action enumeration
Defines the cascade behavior when a parent table's primary key is updated

In SQLite, updating primary key values is generally not recommended
In most cases use NO_ACTION or RESTRICT

## Enumeration Members

### CASCADE \{#cascade\}

```ts
CASCADE: "CASCADE";
```

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:139](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L139)

Cascade update
When the parent table's primary key is updated, automatically update the corresponding foreign key values in all child tables

#### Example

```ts
When the user ID is updated, automatically update user_id in all orders
**Warning:** high performance overhead, frequent use is not recommended
```

***

### NO\_ACTION \{#no_action\}

```ts
NO_ACTION: "NO ACTION";
```

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L125)

Take no action (default)
When the parent table's primary key is updated, do nothing to the child table's foreign keys
If references exist, the update fails (foreign key constraint violation)

#### Default

```ts

```

***

### RESTRICT \{#restrict\}

```ts
RESTRICT: "RESTRICT";
```

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L131)

Restrict the update
If child table references exist, prevent updating the parent table's primary key

***

### SET\_DEFAULT \{#set_default\}

```ts
SET_DEFAULT: "SET DEFAULT";
```

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:153](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L153)

Set to default value
When the parent table's primary key is updated, set the child table's foreign key fields to their default values
**Requires:** the foreign key field must have a DEFAULT value defined

***

### SET\_NULL \{#set_null\}

```ts
SET_NULL: "SET NULL";
```

Defined in: [packages/rxdb/src/entity/relation-types.interface.ts:146](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/relation-types.interface.ts#L146)

Set to NULL
When the parent table's primary key is updated, set the child table's foreign key fields to NULL
**Requires:** the foreign key field must allow NULL values
